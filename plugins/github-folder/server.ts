import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { FOLDER_TAG, rpcContract, type FolderView } from "./lib/contract";
import { createGithubFolder, type GithubSnapshot } from "./lib/gh";
import {
  ATTENTION_LABEL,
  applyPatch,
  buildFolder,
  pruneSnoozed,
  readSettings,
  setSnoozed,
  type FolderSettings,
} from "./lib/github";

const SETTINGS_KEY = "settings";
const REFRESH_MS = 120_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export default async function plugin(bb: BbPluginApi) {
  const github = createGithubFolder();
  let snapshot: GithubSnapshot | null = null;

  const loadSettings = async () => readSettings(await bb.storage.kv.get(SETTINGS_KEY));
  const saveSettings = async (settings: FolderSettings) => {
    await bb.storage.kv.set(SETTINGS_KEY, settings);
    bb.rpc.experimental_invalidate([FOLDER_TAG]);
  };

  async function fetchNow(force: boolean): Promise<GithubSnapshot> {
    const next = await github.read(force);
    const changed = snapshot === null || JSON.stringify(snapshot.prs) !== JSON.stringify(next.prs) || snapshot.error !== next.error;
    snapshot = next;
    if (next.error === null) {
      const settings = await loadSettings();
      const pruned = pruneSnoozed(settings, next.prs);
      if (pruned !== settings) await bb.storage.kv.set(SETTINGS_KEY, pruned);
    }
    if (changed) bb.rpc.experimental_invalidate([FOLDER_TAG]);
    return next;
  }

  async function view(): Promise<FolderView> {
    const current = snapshot ?? (await fetchNow(false));
    const settings = await loadSettings();
    return {
      ...buildFolder(current.prs, settings),
      accounts: current.accounts,
      error: current.error,
      fetchedAt: current.fetchedAt,
      settings,
    };
  }

  bb.rpc.register(rpcContract, {
    folder: () => view(),
    refresh: async () => {
      await fetchNow(true);
      return view();
    },
    updateSettings: async (patch) => {
      await saveSettings(applyPatch(await loadSettings(), patch));
      return { ok: true as const };
    },
    snooze: async ({ key, snoozed }) => {
      await saveSettings(setSnoozed(await loadSettings(), key, snoozed));
      return { ok: true as const };
    },
  });

  bb.background.service("refresh", {
    async start(signal) {
      while (!signal.aborted) {
        try {
          await fetchNow(false);
        } catch (error) {
          bb.log.warn(`GitHub fetch failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        await sleep(REFRESH_MS, signal);
      }
    },
  });

  bb.cli.register({
    name: "github-folder",
    summary: "List the open pull requests that need you",
    commands: [{ name: "list", summary: "List the folder, most urgent first", usage: "bb github-folder list [--json]" }],
    async run(argv) {
      const json = argv.includes("--json");
      const [command] = argv.filter((arg) => arg !== "--json");
      if (command !== "list") {
        return {
          exitCode: command === undefined || command === "help" || command === "--help" ? 0 : 1,
          stdout: "Usage: bb github-folder list [--json]",
        };
      }
      await fetchNow(true);
      const folder = await view();
      if (json) {
        const { items, snoozed, accounts, error, fetchedAt } = folder;
        return { exitCode: 0, stdout: JSON.stringify({ items, snoozed, accounts, error, fetchedAt }) };
      }
      if (folder.error !== null && folder.items.length === 0) return { exitCode: 1, stderr: `Can't reach GitHub: ${folder.error}` };
      if (folder.items.length === 0) return { exitCode: 0, stdout: "Nothing needs you." };
      const lines = folder.items.map(({ pr, attention }) =>
        [
          (attention.map((reason) => ATTENTION_LABEL[reason]).join(", ") || "Your pull request").padEnd(26),
          `${pr.repo}#${pr.number}`.padEnd(40),
          pr.title.slice(0, 80),
        ].join("  "),
      );
      if (folder.snoozed.length > 0) lines.push(`… ${folder.snoozed.length} snoozed`);
      return { exitCode: 0, stdout: lines.join("\n") };
    },
  });
}
