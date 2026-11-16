import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./lib/contract.ts";
import { progressModel } from "./lib/progress.ts";

const run = promisify(execFile);
const list = (dir: string) => readdir(dir).catch(() => [] as string[]);
const exists = (path: string) => stat(path).then(() => true, () => false);

async function findLedger(slug: string): Promise<string | null> {
  const projects = join(homedir(), ".claude", "projects");
  for (const project of await list(projects)) {
    const path = join(projects, project, "orchestrate", `${slug}.md`);
    if (await exists(path)) return path;
  }
  return null;
}

async function findExportScript(): Promise<string | null> {
  const cache = join(homedir(), ".claude", "plugins", "cache");
  const found: { version: number[]; path: string }[] = [];
  for (const marketplace of await list(cache)) {
    for (const version of await list(join(cache, marketplace, "orchestrate"))) {
      const path = join(cache, marketplace, "orchestrate", version, "scripts", "orchestration_ledger.py");
      if (/^\d+(\.\d+)*$/.test(version) && (await exists(path))) found.push({ version: version.split(".").map(Number), path });
    }
  }
  found.sort((a, b) => {
    for (let i = 0; i < Math.max(a.version.length, b.version.length); i++) {
      const d = (b.version[i] ?? 0) - (a.version[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
  return found[0]?.path ?? null;
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    ledgerSlug: { type: "string", label: "Ledger slug", description: "orchestrate/<slug>.md under ~/.claude/projects", default: "orchestration-observability" },
    chatThreadId: { type: "string", label: "Thread with a ```ui reply", description: "Rendered with ThreadChat to test host genui inside a plugin view", default: "" },
    runningExtra: { type: "string", label: "Running parts the ledger doesn't list yet", description: "Comma-separated", default: "" },
  });

  bb.rpc.register(rpcContract, {
    async probe() {
      const { ledgerSlug, chatThreadId, runningExtra } = await settings.get();
      const [ledger, script] = await Promise.all([findLedger(ledgerSlug), findExportScript()]);
      if (!ledger || !script) throw new Error(`ledger ${ledgerSlug} or the orchestrate export script not found`);
      const { stdout } = await run("python3", [script, "export", ledger], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
      const extra = runningExtra.split(",").map((s) => s.trim()).filter(Boolean);
      return { progress: progressModel(JSON.parse(stdout), extra), chatThreadId: chatThreadId || null, readAt: new Date().toISOString() };
    },
  });
}
