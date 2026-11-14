import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { contract, type Agent, type LedgerSummary, type Snapshot } from "./src/contract.ts";
import { summarizeExport } from "./src/ledger.ts";
import { exportScriptCandidates, ledgerFor, scanLedgers, type LedgerFile } from "./src/locate.ts";

const run = promisify(execFile);
const SCAN_TTL_MS = 10_000;
const AGENT_TTL_MS = 15_000;
const OUTPUT_LIMIT = 1_200;
const LIVE_STATUSES = new Set(["working", "briefed", "question", "delivered", "gate", "ready", "card"]);

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    exportScript: {
      type: "string",
      label: "Ledger export script",
      description: "Path to the orchestrate plugin's scripts/orchestration_ledger.py. Leave empty to use the newest installed orchestrate plugin that has the export command.",
      default: "",
    },
  });
  const claudeDir = join(homedir(), ".claude");
  const projectsDir = join(claudeDir, "projects");

  let scan: { at: number; ledgers: Promise<LedgerFile[]> } | null = null;
  function ledgers(): Promise<LedgerFile[]> {
    if (!scan || Date.now() - scan.at > SCAN_TTL_MS) scan = { at: Date.now(), ledgers: scanLedgers(projectsDir) };
    return scan.ledgers;
  }

  let workingScript: { configured: string; path: string } | null = null;
  const exports = new Map<string, { mtimeMs: number; summary: LedgerSummary }>();

  async function exportLedger(path: string): Promise<LedgerSummary> {
    const { mtimeMs } = await stat(path);
    const cached = exports.get(path);
    if (cached && cached.mtimeMs === mtimeMs) return cached.summary;
    const configured = (await settings.get()).exportScript;
    const candidates = workingScript?.configured === configured ? [workingScript.path] : await exportScriptCandidates(configured, claudeDir);
    if (candidates.length === 0) {
      throw new Error("The orchestrate plugin is not installed here. Install it, or set the ledger export script in this plugin's settings.");
    }
    let lastError = "";
    for (const script of candidates) {
      try {
        const { stdout } = await run("python3", [script, "export", path], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
        const summary = summarizeExport(JSON.parse(stdout), path);
        workingScript = { configured, path: script };
        exports.set(path, { mtimeMs, summary });
        return summary;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    workingScript = null;
    bb.log.warn(`ledger export failed for ${path}: ${lastError}`);
    throw new Error("No installed orchestrate plugin could export this ledger; the export needs orchestrate 0.11 or later. Update it, or set the ledger export script in this plugin's settings.");
  }

  const agentCache = new Map<string, { at: number; agent: Agent }>();
  async function readAgent(threadId: string, withOutput: boolean): Promise<Agent> {
    const cached = agentCache.get(threadId);
    if (cached && Date.now() - cached.at < AGENT_TTL_MS && (!withOutput || cached.agent.lastOutput !== null)) return cached.agent;
    const [thread, context, turns, output] = await Promise.all([
      bb.sdk.threads.get({ threadId }).catch(() => null),
      bb.sdk.threads.context({ threadId }).catch(() => null),
      bb.sdk.threads.events.list({ threadId, order: "desc", limit: "1", types: ["client/turn/requested"] }).catch(() => []),
      withOutput ? bb.sdk.threads.output({ threadId }).catch(() => null) : Promise.resolve(null),
    ]);
    const execution = obj(obj(obj(turns[0]).data).execution);
    const usage = obj(obj(context).usage);
    const text = output?.output?.trim() ?? null;
    const agent: Agent = {
      model: str(execution.model),
      effort: str(execution.reasoningLevel),
      contextUsed: num(usage.usedTokens),
      contextWindow: num(usage.modelContextWindow),
      lastOutput: text ? text.slice(0, OUTPUT_LIMIT) : null,
      lastReportAt: num(obj(obj(thread).thread).latestAttentionAt) ?? num(obj(thread).latestAttentionAt),
    };
    agentCache.set(threadId, { at: Date.now(), agent });
    return agent;
  }

  async function snapshot(threadId: string): Promise<Snapshot> {
    const ledger = ledgerFor(await ledgers(), threadId);
    if (!ledger) return { state: "none" };
    let summary: LedgerSummary;
    try {
      summary = await exportLedger(ledger.path);
    } catch (error) {
      return { state: "error", message: error instanceof Error ? error.message : String(error) };
    }
    const agents: Record<string, Agent> = {};
    await Promise.all(summary.subtasks.map(async (subtask) => {
      if (!subtask.threadId) return;
      const live = LIVE_STATUSES.has(subtask.status ?? "");
      agents[subtask.threadId] = await readAgent(subtask.threadId, live);
    }));
    return { state: "ledger", ledger: summary, agents, readAt: Date.now() };
  }

  bb.rpc.register(contract, {
    isOrchestrator: async ({ keys }) => {
      const all = await ledgers();
      return Object.fromEntries(keys.map((key) => [key, ledgerFor(all, key) !== null]));
    },
    snapshot: ({ threadId }) => snapshot(threadId),
  });
}
