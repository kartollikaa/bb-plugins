import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { fetchClaude, message, readKeychainCredentials } from "./lib/claude";
import { fetchCodexSites, readCodexAuth } from "./lib/codex";
import { LIST_TAG, rpcContract, type ListView, type SourceList } from "./lib/contract";
import { formatList } from "./lib/format";

const FRESH_MS = 5 * 60_000;
const RETRY_MS = 30_000;

async function settle(read: () => Promise<SourceList>): Promise<SourceList> {
  try {
    return await read();
  } catch (error) {
    return { items: [], error: message(error) };
  }
}

export default async function plugin(bb: BbPluginApi) {
  let view: ListView | null = null;
  let inFlight: Promise<ListView> | null = null;

  function fetchNow(): Promise<ListView> {
    inFlight ??= (async () => {
      const [claude, codex] = await Promise.all([
        settle(async () => fetchClaude(await readKeychainCredentials())),
        settle(async () => fetchCodexSites(await readCodexAuth())),
      ]);
      view = { claude, codex, fetchedAt: Date.now() };
      bb.rpc.experimental_invalidate([LIST_TAG]);
      for (const [source, list] of Object.entries({ claude, codex })) {
        if (list.error) bb.log.warn(`${source}: ${list.error}`);
      }
      return view;
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  const current = () => {
    const ttl = view?.claude.error || view?.codex.error ? RETRY_MS : FRESH_MS;
    return view !== null && Date.now() - (view.fetchedAt ?? 0) < ttl ? Promise.resolve(view) : fetchNow();
  };

  bb.rpc.register(rpcContract, {
    list: () => current(),
    refresh: () => fetchNow(),
  });

  bb.cli.register({
    name: "artifacts",
    summary: "List your published Claude Code artifacts and Codex Sites",
    commands: [{ name: "list", summary: "List both sources, newest first", usage: "bb artifacts list [--json]" }],
    async run(argv) {
      const json = argv.includes("--json");
      const [command] = argv.filter((arg) => arg !== "--json");
      if (command !== "list") {
        return {
          exitCode: command === undefined || command === "help" || command === "--help" ? 0 : 1,
          stdout: "Usage: bb artifacts list [--json]",
        };
      }
      const result = await fetchNow();
      if (json) return { exitCode: 0, stdout: JSON.stringify(result) };
      const failed = result.claude.error !== null && result.codex.error !== null;
      return { exitCode: failed ? 1 : 0, stdout: formatList(result) };
    },
  });
}
