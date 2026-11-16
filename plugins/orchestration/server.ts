import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { contract, type Agent, type LedgerSummary, type Snapshot } from "./src/contract.ts";
import { answeredAsks, askFirstSeen, collectOwnerMessages, observe, sameLines, type Answer, type Observation, type OwnerMessage } from "./src/answered.ts";
import { reportOf } from "./src/report.ts";
import { describePending } from "./src/pending.ts";
import { summarizeExport } from "./src/ledger.ts";
import { exportScriptCandidates, ledgerFor, scanLedgers, type LedgerFile } from "./src/locate.ts";
import { resolveOwner } from "./src/route.ts";
import { quickReplyTitles, REPLY_MODE, replySender, toDelivery } from "./src/reply.ts";
import { validReply } from "./src/questions.ts";
import { createActivityReader, createRefreshScheduler, type ActivityListArgs } from "./src/activity.ts";

const run = promisify(execFile);
const SCAN_TTL_MS = 10_000;
const AGENT_TTL_MS = 15_000;
const FINISHED_AGENT_TTL_MS = 10 * 60_000;
const OUTPUT_LIMIT = 1_200;
const BRIEF_LIMIT = 600;
const REPLY_DEDUPE_MS = 5_000;
const OWNER_MESSAGES = 20;
const EVENT_PAGE = 100;
const EVENT_PAGES = 5;
const OBSERVATION_SAVE_MS = 60_000;
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
    const record = obj(obj(thread).thread ?? thread);
    const usage = obj(obj(context).usage);
    const text = output?.output?.trim() ?? null;
    const agent: Agent = {
      model: str(execution.model),
      effort: str(execution.reasoningLevel),
      contextUsed: num(usage.usedTokens),
      contextWindow: num(usage.modelContextWindow),
      lastOutput: text ? text.slice(0, OUTPUT_LIMIT) : null,
      lastReportAt: num(record.latestAttentionAt),
      archivedAt: num(record.archivedAt),
    };
    agentCache.set(threadId, { at: Date.now(), agent });
    return agent;
  }

  const briefCache = new Map<string, string | null>();
  async function briefOf(threadId: string): Promise<string | null> {
    if (briefCache.has(threadId)) return briefCache.get(threadId)!;
    const events = await bb.sdk.threads.events.list({ threadId, order: "asc", limit: "1", types: ["client/turn/requested"] }).catch(() => null);
    if (events === null) return null;
    const input = obj(obj(events[0]).data).input;
    const text = (Array.isArray(input) ? input : []).map((part) => obj(part).text).filter((t): t is string => typeof t === "string").join("\n").slice(0, BRIEF_LIMIT) || null;
    briefCache.set(threadId, text);
    return text;
  }

  /** The first message of each part's thread: it names a child the ledger doesn't list yet and describes every Plan step. */
  async function childBriefs(threadId: string, ledger: LedgerSummary): Promise<Record<string, string>> {
    const named = ledger.subtasks.flatMap((s) => (s.threadId ? [s.threadId] : []));
    const children = await bb.sdk.threads.list({ parentThreadId: threadId, limit: 100 }).catch(() => []);
    const ids = [...new Set([...named, ...children.map((t) => t.id)])];
    const entries = await Promise.all(ids.map(async (id) => [id, await briefOf(id)] as const));
    return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e[1] !== null));
  }

  const observations = new Map<string, { observation: Observation | null; savedAt: number }>();
  async function observeOwnerLines(path: string, lines: string[]): Promise<Record<string, number>> {
    const key = `observed:${path}`;
    let known = observations.get(path);
    if (!known) {
      let saved: Observation | undefined;
      try {
        saved = await bb.storage.kv.get<Observation>(key);
      } catch (error) {
        bb.log.warn(`can't read «For the owner» observations: ${String(error)}`);
        return observe(null, lines, Date.now()).firstSeen;
      }
      known = { observation: saved ?? null, savedAt: saved?.observedAt ?? 0 };
    }
    const previous = known.observation;
    const next = observe(previous, lines, Date.now());
    const save = !sameLines(previous, next) || next.observedAt - known.savedAt > OBSERVATION_SAVE_MS;
    observations.set(path, { observation: next, savedAt: save ? next.observedAt : known.savedAt });
    if (save) await bb.storage.kv.set(key, next).catch((error) => bb.log.warn(`can't save «For the owner» observations: ${String(error)}`));
    return next.firstSeen;
  }

  const ownerMessages = (threadId: string) => collectOwnerMessages(
    (beforeSeq) => bb.sdk.threads.events.list({ threadId, order: "desc", limit: String(EVENT_PAGE), types: ["client/turn/requested"], beforeSeq }),
    { want: OWNER_MESSAGES, pageSize: EVENT_PAGE, pages: EVENT_PAGES },
  );

  async function answersFor(threadId: string, ledger: LedgerSummary): Promise<{ answered: Record<string, Answer>; askFirstSeen: Record<string, number> }> {
    const since = askFirstSeen(ledger.forTheOwner, await observeOwnerLines(ledger.path, ledger.forTheOwner), ledger.status);
    if (Object.keys(since).length === 0) return { answered: {}, askFirstSeen: since };
    return { answered: answeredAsks(since, await ownerMessages(threadId)), askFirstSeen: since };
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
    const [answers, report, ownerThread, storage, briefs] = await Promise.all([
      answersFor(threadId, summary).catch((error) => {
        bb.log.warn(`can't read the owner's answers: ${String(error)}`);
        return { answered: {}, askFirstSeen: {} };
      }),
      bb.sdk.threads.output({ threadId }).then((value) => reportOf(value.output)).catch(() => null),
      bb.sdk.threads.get({ threadId }).catch(() => null),
      bb.sdk.threads.storageLocation({ threadId }).catch(() => null),
      childBriefs(threadId, summary).catch(() => ({})),
      ...summary.subtasks.map(async (subtask) => {
        if (!subtask.threadId) return;
        const live = LIVE_STATUSES.has(subtask.status ?? "");
        agents[subtask.threadId] = await readAgent(subtask.threadId, live, FINISHED_STATUSES.has(subtask.status ?? ""));
      }),
    ]);
    const environment = ownerThread?.environmentId ? await bb.sdk.environments.get({ environmentId: ownerThread.environmentId }).catch(() => null) : null;
    const workspace = environment?.id && environment.path ? { environmentId: environment.id, rootPath: environment.path, hostId: environment.hostId, ledgerHostId: null as string | null, storageRootPath: storage?.hostId === environment.hostId ? storage.storageRootPath : null } : null;
    if (workspace) {
      const [local, remote] = await Promise.all([
        readFile(summary.path, "utf8").catch(() => null),
        bb.sdk.files.read({ hostId: workspace.hostId, path: summary.path }).catch(() => null),
      ]);
      if (local !== null && remote?.contentEncoding === "utf8" && remote.content === local) workspace.ledgerHostId = workspace.hostId;
    }
    const ledgerModifiedAt = await stat(ledger.path).then((s) => s.mtimeMs, () => null);
    return { state: "ledger", ledger: summary, agents, report, workspace, ...answers, briefs, ledgerModifiedAt, readAt: Date.now() };
  }

  const sendReply = replySender(async (threadId, text) => {
    const result = await bb.sdk.threads.send({ threadId, input: [{ type: "text", text, mentions: [] }], mode: REPLY_MODE });
    return toDelivery(result.delivery);
  }, { windowMs: REPLY_DEDUPE_MS, now: Date.now });

  async function reply(threadId: string, text: string) {
    const ledger = ledgerFor(await ledgers(), threadId);
    if (!ledger) throw new Error("This thread is not an orchestrator, so nothing was sent.");
    const summary = await exportLedger(ledger.path);
    if (!validReply(text, quickReplyTitles(summary.forTheOwner))) throw new Error("The ledger no longer offers one of these answers, so nothing was sent.");
    const delivery = await sendReply(threadId, text);
    await observeOwnerLines(ledger.path, summary.forTheOwner).catch(() => {});
    return { delivery };
  }

  async function parentOf(id: string): Promise<string | null> {
    const result = obj(await bb.sdk.threads.get({ threadId: id }).catch(() => null));
    return str(obj(result.thread ?? result).parentThreadId);
  }

  /** Pending interactions of the orchestrator, its ledger's subtasks and its child threads; any other thread reads as null. */
  async function pending(threadId: string, threadIds: string[]) {
    const ledger = ledgerFor(await ledgers(), threadId);
    if (!ledger) return {};
    const summary = await exportLedger(ledger.path).catch(() => null);
    const named = new Set(summary?.subtasks.flatMap((s) => (s.threadId ? [s.threadId] : [])) ?? []);
    const entries = await Promise.all([...new Set(threadIds)].map(async (id) => {
      const ours = id === threadId || named.has(id) || await parentOf(id) === threadId;
      if (!ours) return [id, null] as const;
      const list = await bb.sdk.threads.interactions.list({ threadId: id }).catch(() => []);
      const found = list.map(describePending).find((p) => p !== null) ?? null;
      return [id, found] as const;
    }));
    return Object.fromEntries(entries);
  }

  const activity = createActivityReader({
    listEvents: (args: ActivityListArgs) => bb.sdk.threads.events.list(args as Parameters<typeof bb.sdk.threads.events.list>[0]),
    log: (message) => bb.log.warn(message),
  });
  const refreshActivity = createRefreshScheduler({ has: activity.has, invalidate: (tags) => bb.rpc.experimental_invalidate(tags) });
  for (const event of ["experimental_thread.events", "thread.active", "thread.idle", "thread.failed"] as const) {
    bb.events.on(event, ({ thread }) => refreshActivity(thread.id));
  }

  bb.rpc.register(contract, {
    orchestrators: async () => ({ ids: [...new Set((await ledgers()).map((ledger) => ledger.orchestratorId))] }),
    owner: async ({ threadId }) => {
      const all = await ledgers();
      const owner = await resolveOwner(threadId, (id) => ledgerFor(all, id) !== null, async (id) => {
        const result = obj(await bb.sdk.threads.get({ threadId: id }));
        return str(obj(result.thread ?? result).parentThreadId);
      });
      return { owner };
    },
    isOrchestrator: async ({ keys }) => {
      const all = await ledgers();
      return Object.fromEntries(keys.map((key) => [key, ledgerFor(all, key) !== null]));
    },
    snapshot: ({ threadId }) => snapshot(threadId),
    reply: ({ threadId, text }) => reply(threadId, text),
    pending: ({ threadId, threadIds }) => pending(threadId, threadIds),
    activity: async ({ keys }) => Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await activity.read(key).catch(() => null)] as const))),
    setOrchestrationView: async ({ on }) => ({ on: (await settings.experimental_set({ orchestrationView: on })).orchestrationView }),
  });
}
