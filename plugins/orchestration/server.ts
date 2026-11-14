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
const FINISHED_AGENT_TTL_MS = 10 * 60_000;
const OUTPUT_LIMIT = 1_200;
const FINISHED_STATUSES = new Set(["landed", "verified", "dropped"]);
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
    orchestrationView: {
      type: "boolean",
      label: "Open orchestrators on the Orchestration view",
      description: "On: an orchestrator's thread opens on the Orchestration view with its chat in a side rail. Off: it opens in bb's normal thread view. The Orchestration view switch in the title bar changes this setting.",
      default: true,
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
  const failures = new Map<string, { key: string; error: Error }>();

  async function scriptsToTry(configured: string): Promise<string[]> {
    const all = await exportScriptCandidates(configured, claudeDir);
    if (workingScript?.configured !== configured) return all;
    const known = workingScript.path;
    const exists = await stat(known).then(() => true, () => false);
    return exists ? [known, ...all.filter((path) => path !== known)] : all;
  }

  async function exportLedger(path: string): Promise<LedgerSummary> {
    const { mtimeMs } = await stat(path);
    const cached = exports.get(path);
    if (cached && cached.mtimeMs === mtimeMs) return cached.summary;
    const configured = (await settings.get()).exportScript;
    const failureKey = `${mtimeMs}\u0000${configured}`;
    const failed = failures.get(path);
    if (failed && failed.key === failureKey) throw failed.error;
    const fail = (error: Error): never => {
      failures.set(path, { key: failureKey, error });
      throw error;
    };
    const candidates = await scriptsToTry(configured);
    if (candidates.length === 0) {
      fail(new Error("The orchestrate plugin is not installed here. Install it, or set the ledger export script in this plugin's settings."));
    }
    let lastError = "";
    for (const script of candidates) {
      try {
        const { stdout } = await run("python3", [script, "export", path], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
        const summary = summarizeExport(JSON.parse(stdout), path);
        workingScript = { configured, path: script };
        exports.set(path, { mtimeMs, summary });
        failures.delete(path);
        return summary;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    workingScript = null;
    bb.log.warn(`ledger export failed for ${path}: ${lastError}`);
    return fail(new Error("No installed orchestrate plugin could export this ledger; the export command is newer than the installed versions. Update orchestrate, or set the ledger export script in this plugin's settings."));
  }

  const agentCache = new Map<string, { at: number; agent: Agent }>();
  async function readAgent(threadId: string, withOutput: boolean, finished: boolean): Promise<Agent> {
    const cached = agentCache.get(threadId);
    const ttl = finished ? FINISHED_AGENT_TTL_MS : AGENT_TTL_MS;
    if (cached && Date.now() - cached.at < ttl && (!withOutput || cached.agent.lastOutput !== null)) return cached.agent;
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
      agents[subtask.threadId] = await readAgent(subtask.threadId, live, FINISHED_STATUSES.has(subtask.status ?? ""));
    }));
    return { state: "ledger", ledger: summary, agents, readAt: Date.now() };
  }

  bb.rpc.register(contract, {
    isOrchestrator: async ({ keys }) => {
      const all = await ledgers();
      return Object.fromEntries(keys.map((key) => [key, ledgerFor(all, key) !== null]));
    },
    snapshot: ({ threadId }) => snapshot(threadId),
    setOrchestrationView: async ({ on }) => ({ on: (await settings.experimental_set({ orchestrationView: on })).orchestrationView }),
  });
}
