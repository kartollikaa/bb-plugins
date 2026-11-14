// Finds ledgers on this machine and the orchestrate plugin's export script.
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { orchestratorIdOf } from "./ledger.ts";

export interface LedgerFile {
  path: string;
  orchestratorId: string;
  mtimeMs: number;
}

async function firstLine(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(400);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8").split("\n")[0] ?? "";
  } finally {
    await handle.close();
  }
}

async function list(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/** Every `<projects>/<project>/orchestrate/<slug>.md` whose first line names an orchestrator. */
export async function scanLedgers(projectsDir: string): Promise<LedgerFile[]> {
  const found: LedgerFile[] = [];
  for (const project of await list(projectsDir)) {
    const dir = join(projectsDir, project, "orchestrate");
    for (const name of await list(dir)) {
      if (!name.endsWith(".md")) continue;
      const path = join(dir, name);
      try {
        const info = await stat(path);
        if (!info.isFile()) continue;
        const id = orchestratorIdOf(await firstLine(path));
        if (id) found.push({ path, orchestratorId: id, mtimeMs: info.mtimeMs });
      } catch {
        // A ledger removed or unreadable mid-scan is skipped.
      }
    }
  }
  return found;
}

export function ledgerFor(ledgers: readonly LedgerFile[], threadId: string): LedgerFile | null {
  let best: LedgerFile | null = null;
  for (const ledger of ledgers) {
    if (ledger.orchestratorId === threadId && (!best || ledger.mtimeMs > best.mtimeMs)) best = ledger;
  }
  return best;
}

const SCRIPT = join("scripts", "orchestration_ledger.py");

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Scripts to try, best first: the configured one alone, else installed orchestrate versions newest first, then marketplace checkouts. */
export async function exportScriptCandidates(configured: string, claudeDir: string): Promise<string[]> {
  if (configured.trim()) return [configured.trim()];
  const cache = join(claudeDir, "plugins", "cache");
  const installed: { version: string; path: string }[] = [];
  for (const marketplace of await list(cache)) {
    const pluginDir = join(cache, marketplace, "orchestrate");
    for (const version of await list(pluginDir)) {
      const path = join(pluginDir, version, SCRIPT);
      if (/^\d+(\.\d+)*$/.test(version) && (await exists(path))) installed.push({ version, path });
    }
  }
  installed.sort((a, b) => compareVersions(b.version, a.version));
  const checkouts: string[] = [];
  for (const marketplace of await list(join(claudeDir, "plugins", "marketplaces"))) {
    const path = join(claudeDir, "plugins", "marketplaces", marketplace, "plugins", "orchestrate", SCRIPT);
    if (await exists(path)) checkouts.push(path);
  }
  return [...installed.map((c) => c.path), ...checkouts];
}
