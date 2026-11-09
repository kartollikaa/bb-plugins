import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { BOARD_TAG, rpcContract, type BoardView } from "./lib/contract";
import {
  DEFAULT_BOARD_ID,
  buildBoard,
  cardPrompt,
  resolveCredentials,
  type Credentials,
  type RawBoard,
  type RawCard,
  type RawCardDetail,
  type RawComment,
} from "./lib/kaiten";

const PROJECT_KEY = "projectId";
const THREADS_KEY = "threads";
const REFRESH_MS = 90_000;
const PAGE = 100;
const MAX_PAGES = 20;

type ThreadMap = Record<string, string>;
type Snapshot = { board: BoardView["board"]; error: string | null; fetchedAt: number };

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    token: { type: "string", label: "Kaiten API token", secret: true },
    domain: { type: "string", label: "Kaiten domain", default: "" },
    boardId: {
      type: "number",
      label: "Board id",
      default: DEFAULT_BOARD_ID,
    },
  });

  let snapshot: Snapshot | null = null;
  let userId: number | null = null;
  const stopping = new AbortController();
  bb.onDispose(() => stopping.abort());

  async function credentials(): Promise<Credentials> {
    const { token, domain } = await settings.get();
    const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "kaiten");
    const found = resolveCredentials({
      settingToken: token,
      settingDomain: domain,
      envFile: await readOptional(join(configDir, ".env.local")),
      configJson: await readOptional(join(configDir, "config.json")),
    });
    if (found === null) {
      throw new Error("No Kaiten token. Set it in the plugin settings, or in ~/.config/kaiten/.env.local as KAITEN_TOKEN.");
    }
    return found;
  }

  async function kaiten<T>(creds: Credentials, path: string): Promise<T> {
    const response = await fetch(`https://${creds.domain}/api/latest${path}`, {
      headers: { Authorization: `Bearer ${creds.token}`, Accept: "application/json" },
      signal: AbortSignal.any([AbortSignal.timeout(20_000), stopping.signal]),
    });
    if (!response.ok) {
      throw new Error(`Kaiten answered ${response.status}${response.status === 401 ? " (check the token)" : ""} for ${path.split("?")[0]}`);
    }
    return (await response.json()) as T;
  }

  async function readThreadMap(): Promise<ThreadMap> {
    return (await bb.storage.kv.get<ThreadMap>(THREADS_KEY)) ?? {};
  }

  async function liveThreads(): Promise<Map<number, string>> {
    const map = await readThreadMap();
    const entries = Object.entries(map);
    if (entries.length === 0) return new Map();
    const ids = [...new Set(entries.map(([, threadId]) => threadId))].slice(0, 200);
    const alive = new Set((await bb.sdk.threads.list({ threadIds: ids, archived: false, limit: 200 })).map((thread) => thread.id));
    const live = new Map<number, string>();
    for (const [cardId, threadId] of entries) if (alive.has(threadId)) live.set(Number(cardId), threadId);
    return live;
  }

  async function fetchBoard(): Promise<Snapshot> {
    try {
      const creds = await credentials();
      const { boardId } = await settings.get();
      if (userId === null) userId = (await kaiten<{ id: number }>(creds, "/users/current")).id;
      const raw = await kaiten<RawBoard>(creds, `/boards/${boardId}`);
      const cards: RawCard[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const batch = await kaiten<RawCard[]>(creds, `/cards?board_id=${boardId}&condition=1&limit=${PAGE}&offset=${page * PAGE}`);
        cards.push(...batch);
        if (batch.length < PAGE) break;
      }
      const board = buildBoard(raw, cards, { domain: creds.domain, userId, threads: await liveThreads() });
      return { board, error: null, fetchedAt: Date.now() };
    } catch (error) {
      return { board: snapshot?.board ?? null, error: error instanceof Error ? error.message : String(error), fetchedAt: Date.now() };
    }
  }

  async function refresh(): Promise<Snapshot> {
    const next = await fetchBoard();
    if (stopping.signal.aborted) return next;
    const changed = JSON.stringify(next.board) !== JSON.stringify(snapshot?.board) || next.error !== snapshot?.error;
    snapshot = next;
    if (changed) bb.rpc.experimental_invalidate([BOARD_TAG]);
    return next;
  }

  async function view(): Promise<BoardView> {
    const current = snapshot ?? (await refresh());
    const projects = (await bb.sdk.projects.list()).map((project) => ({ id: project.id, name: project.name }));
    const stored = await bb.storage.kv.get<string>(PROJECT_KEY);
    return {
      board: current.board,
      error: current.error,
      fetchedAt: current.fetchedAt,
      projects,
      projectId: projects.some((project) => project.id === stored) ? (stored ?? null) : null,
    };
  }

  bb.rpc.register(rpcContract, {
    board: () => view(),
    refresh: async () => {
      await refresh();
      return view();
    },
    setProject: async ({ projectId }) => {
      await bb.storage.kv.set(PROJECT_KEY, projectId);
      bb.rpc.experimental_invalidate([BOARD_TAG]);
      return { ok: true as const };
    },
    startCard: async ({ cardId }) => {
      const existing = (await liveThreads()).get(cardId);
      if (existing !== undefined) return { threadId: existing, reused: true };

      const projectId = await bb.storage.kv.get<string>(PROJECT_KEY);
      if (!projectId) throw new Error("Pick a project for the new thread first.");
      const creds = await credentials();
      const card = await kaiten<RawCardDetail>(creds, `/cards/${cardId}`);
      const comments = await kaiten<RawComment[]>(creds, `/cards/${cardId}/comments`).catch(() => [] as RawComment[]);
      const thread = await bb.sdk.threads.spawn({
        projectId,
        environment: { type: "project-default" },
        title: `Kaiten #${card.id}: ${card.title}`.slice(0, 120),
        prompt: cardPrompt(card, comments, creds.domain),
        pluginMetadata: { kaitenCardId: card.id },
      });
      await bb.storage.kv.set(THREADS_KEY, { ...(await readThreadMap()), [String(cardId)]: thread.id });
      bb.rpc.experimental_invalidate([BOARD_TAG]);
      return { threadId: thread.id, reused: false };
    },
  });

  bb.background.service("refresh", {
    async start(signal) {
      signal.addEventListener("abort", () => stopping.abort(), { once: true });
      while (!signal.aborted) {
        await refresh();
        await sleep(REFRESH_MS, signal);
      }
    },
  });

  bb.cli.register({
    name: "kaiten",
    summary: "Show the Kaiten sprint board",
    commands: [{ name: "board", summary: "List the board's cards by column", usage: "bb kaiten board [--json]" }],
    async run(argv) {
      const json = argv.includes("--json");
      const [command] = argv.filter((arg) => arg !== "--json");
      if (command !== "board") {
        return {
          exitCode: command === undefined || command === "help" || command === "--help" ? 0 : 1,
          stdout: "Usage: bb kaiten board [--json]",
        };
      }
      const current = await refresh();
      if (current.board === null) return { exitCode: 1, stderr: `Can't read the board: ${current.error ?? "unknown error"}` };
      if (json) return { exitCode: 0, stdout: JSON.stringify({ board: current.board, error: current.error, fetchedAt: current.fetchedAt }) };
      const lines = [current.board.title];
      for (const column of current.board.columns.filter((candidate) => !candidate.done)) {
        lines.push("", `${column.title} (${column.cards.length})`);
        for (const card of column.cards) {
          lines.push(`  #${card.id}  ${card.title.slice(0, 90)}${card.owner ? `  — ${card.owner}` : ""}${card.threadId ? `  [thread ${card.threadId}]` : ""}`);
        }
      }
      return { exitCode: 0, stdout: lines.join("\n") };
    },
  });
}
