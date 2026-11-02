import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract, type GithubStatus } from "./lib/contract.ts";
import { collectLinks, sortLinks, type TextSource, type ThreadLink } from "./lib/links.ts";
import { GH_PR_FIELDS, parsePullRequest } from "./lib/pull-request.ts";

type Json = Record<string, unknown>;

/** Message text a person reads in the transcript: the prompts and the agent's replies, never tool output. */
export function messageText(row: { seq: number; type: string; data: unknown }): TextSource[] {
  const data = (row.data ?? {}) as Json;
  if (row.type === "client/turn/requested") {
    if (data.initiator === "system" || !Array.isArray(data.input)) return [];
    return (data.input as Json[])
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => ({ seq: row.seq, text: part.text as string }));
  }
  if (row.type === "item/completed") {
    const item = (data.item ?? {}) as Json;
    if (item.type === "agentMessage" && typeof item.text === "string") return [{ seq: row.seq, text: item.text }];
  }
  return [];
}

/** The default gh login first, then every extra `~/.config/gh-*` profile, for repos only another account sees. */
export function ghConfigDirs(configRoot = join(homedir(), ".config")): (string | null)[] {
  let extra: string[] = [];
  try {
    extra = readdirSync(configRoot)
      .filter((name) => name.startsWith("gh-") && existsSync(join(configRoot, name, "hosts.yml")))
      .sort()
      .map((name) => join(configRoot, name));
  } catch {
    extra = [];
  }
  return [null, ...extra];
}

const PAGE = 100;
const MAX_THREADS = 200;
const MAX_STATUSES = 500;
const STATUS_TTL_MS = 25_000;
const GH_TIMEOUT_MS = 20_000;

interface ThreadCache {
  afterSeq: number;
  links: Map<string, ThreadLink>;
}

function ghBinary(): string {
  return ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find((path) => existsSync(path)) ?? "gh";
}

function runGh(args: string[], configDir: string | null): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  if (configDir !== null) env.GH_CONFIG_DIR = configDir;
  return new Promise((resolve, reject) => {
    execFile(ghBinary(), args, { env, timeout: GH_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split("\n")[0] || "gh failed"));
      else resolve(stdout);
    });
  });
}

export default async function plugin(bb: BbPluginApi) {
  const threads = new Map<string, ThreadCache>();
  const statuses = new Map<string, { at: number; value: Promise<GithubStatus> }>();
  const configByOwner = new Map<string, string | null>();

  async function readLinks(threadId: string): Promise<ThreadLink[]> {
    const cache = threads.get(threadId) ?? { afterSeq: 0, links: new Map<string, ThreadLink>() };
    threads.delete(threadId);
    threads.set(threadId, cache);
    if (threads.size > MAX_THREADS) threads.delete(threads.keys().next().value!);
    for (;;) {
      const rows = await bb.sdk.threads.events.list({
        threadId,
        afterSeq: String(cache.afterSeq),
        limit: String(PAGE),
        order: "asc",
        types: ["client/turn/requested", "item/completed"],
      });
      collectLinks(rows.flatMap(messageText), cache.links);
      if (rows.length > 0) cache.afterSeq = rows[rows.length - 1]!.seq;
      if (rows.length < PAGE) break;
    }
    return sortLinks(cache.links.values());
  }

  async function fetchGithub(url: string): Promise<GithubStatus> {
    const [, owner = "", , section] = new URL(url).pathname.split("/");
    const isPull = section === "pull";
    const args = isPull
      ? ["pr", "view", url, "--json", GH_PR_FIELDS]
      : ["issue", "view", url, "--json", "title,state,stateReason"];
    const known = configByOwner.get(owner);
    const dirs = ghConfigDirs();
    const ordered = known === undefined ? dirs : [known, ...dirs.filter((dir) => dir !== known)];
    let lastError = "gh is not available";
    for (const dir of ordered) {
      try {
        const raw = JSON.parse(await runGh(args, dir)) as Json;
        configByOwner.set(owner, dir);
        if (isPull) return { kind: "pull-request", pullRequest: parsePullRequest(raw) };
        const reason = raw.stateReason;
        const state =
          raw.state === "OPEN" ? "open" : reason === "COMPLETED" ? "completed" : reason === "NOT_PLANNED" ? "not_planned" : "closed";
        return { kind: "issue", issue: { title: typeof raw.title === "string" ? raw.title : "", state } };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    bb.log.warn(`gh could not read ${url}: ${lastError}`);
    return { kind: "unavailable", message: lastError };
  }

  function githubStatus(url: string): Promise<GithubStatus> {
    const cached = statuses.get(url);
    if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.value;
    const value = fetchGithub(url);
    statuses.delete(url);
    statuses.set(url, { at: Date.now(), value });
    if (statuses.size > MAX_STATUSES) statuses.delete(statuses.keys().next().value!);
    return value;
  }

  bb.rpc.register(rpcContract, {
    links: async ({ threadId }) => ({ links: await readLinks(threadId) }),
    githubStatus: ({ url }) => githubStatus(url),
  });

  bb.events.on("experimental_thread.events", ({ thread }) => {
    if (threads.has(thread.id)) bb.rpc.experimental_invalidate([`links:${thread.id}`]);
  });
  bb.events.on("thread.deleted", ({ thread }) => {
    threads.delete(thread.id);
  });

  const usage = "Usage: bb thread-links list <thread-id> [--json]";
  bb.cli.register({
    name: "thread-links",
    summary: "List the links a thread's messages mention",
    commands: [{ name: "list", summary: "List a thread's links", usage }],
    async run(argv) {
      const json = argv.includes("--json");
      const [command, threadId] = argv.filter((arg) => arg !== "--json");
      if (command === undefined || command === "help" || command === "--help") return { exitCode: 0, stdout: usage };
      if (command !== "list" || threadId === undefined) return { exitCode: 1, stderr: usage };
      const links = await readLinks(threadId);
      if (json) return { exitCode: 0, stdout: JSON.stringify(links) };
      if (links.length === 0) return { exitCode: 0, stdout: "No links." };
      return { exitCode: 0, stdout: links.map((link) => `${link.kind.padEnd(12)} ${link.label}  ${link.url}`).join("\n") };
    },
  });

  bb.onDispose(() => {
    threads.clear();
    statuses.clear();
  });
}
