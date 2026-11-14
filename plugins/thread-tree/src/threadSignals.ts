// What a thread's own event log says about its current turn: step, timer, progress, context fill, rate limits, failures.
import { z } from "zod";
import { runningContext } from "./statusFilters.ts";
import { RUNNING_STATUSES } from "./tree.ts";

/** Owner's rule: a working thread with no progress for this long is stuck, whatever its role. */
export const STUCK_AFTER_MS = 30 * 60_000;
/** From here the Running list names the context fill. */
export const CONTEXT_NOTE_PERCENT = 80;
export const FAILURES_IN_A_ROW_NOTE = 3;

export const SIGNAL_EVENT_TYPES = [
  "turn/started",
  "turn/completed",
  "item/started",
  "item/completed",
  "provider/error",
  "thread/contextWindowUsage/updated",
  "thread/compacted",
  "thread/context/cleared",
] as const;

/** Bookkeeping that arrives while an agent makes no progress of its own. */
const NOT_PROGRESS = new Set([
  "provider/error",
  "provider/warning",
  "provider/rateLimits/updated",
  "system/provider-turn-watchdog",
  "system/thread-provisioning",
  "thread/contextWindowUsage/updated",
  "thread/tokenUsage/updated",
  "thread/extensionState/updated",
]);

export interface SignalEventRow {
  seq: number;
  type: string;
  createdAt: number;
  data: unknown;
  scope?: unknown;
}

export const threadSignalsSchema = z.object({
  turnStartedAt: z.number().nullable(),
  step: z.string().nullable(),
  lastProgressAt: z.number().nullable(),
  /** A rate-limit error in the running turn; progress after it means it passed. */
  rateLimitedAt: z.number().nullable(),
  failedTurnsInARow: z.number(),
  /** A command or tool call of the turn hasn't finished: the agent is waiting on it, not silent. */
  toolRunning: z.boolean(),
  lastFailureRateLimited: z.boolean(),
  context: z.object({ usedTokens: z.number(), windowTokens: z.number() }).nullable(),
});
export type ThreadSignals = z.infer<typeof threadSignalsSchema>;

export interface SignalFold {
  lastSeq: number;
  turnId: string | null;
  /** Subagent turns started since the top-level one; their completions carry no parent marker. */
  nestedTurnIds: readonly string[];
  openToolIds: readonly string[];
  progressAt: number | null;
  turnStartedAt: number | null;
  step: string | null;
  rateLimitedAt: number | null;
  turnSawRateLimit: boolean;
  failedTurnsInARow: number;
  lastFailureRateLimited: boolean;
  context: ThreadSignals["context"];
}

export function emptySignalFold(): SignalFold {
  return { lastSeq: 0, turnId: null, nestedTurnIds: [], openToolIds: [], progressAt: null, turnStartedAt: null, step: null, rateLimitedAt: null, turnSawRateLimit: false, failedTurnsInARow: 0, lastFailureRateLimited: false, context: null };
}

type Loose = Record<string, unknown> | null | undefined;
const record = (value: unknown): Loose => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const firstLine = (value: string) => value.trim().split("\n")[0]!.trim();

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const GIST_WORDS = 3;

/** A part's command words after its `VAR=value` prefixes; none when a value spans words, as `D=$(mktemp -d)` does. */
function withoutAssignments(part: string): string[] {
  const words = part.split(/\s+/);
  const first = words.findIndex((word) => !ASSIGNMENT.test(word));
  if (words.slice(0, first === -1 ? words.length : first).some((word) => /\$\(|["'`]/.test(word))) return [];
  return first === -1 ? [] : words.slice(first);
}

/** The first real command of a shell line, in a few words: no variable setup, `cd`, pipes or redirects. */
export function commandGist(command: string): string {
  const line = firstLine(command);
  const parts = line.split(/\s*(?:&&|\|\||;|\|)\s*/).map((part) => part.trim()).filter(Boolean);
  const commands = parts.map(withoutAssignments).filter((words) => words.length > 0 && words[0] !== "cd");
  return commands[0]?.filter((word) => !/^\d*[<>]/.test(word)).slice(0, GIST_WORDS).join(" ") ?? line;
}

/** A started item in a few words, as bb's own timeline labels it; null for items that aren't a step. */
export function stepText(item: unknown): string | null {
  const entry = record(item);
  if (!entry) return null;
  const presentation = record(entry.presentation);
  if (presentation?.suppress === true) return null;
  const pending = text(record(presentation?.label)?.pending);
  switch (entry.type) {
    case "commandExecution": {
      const command = text(entry.command) ?? text(presentation?.title);
      return command ? `Running ${commandGist(command)}` : pending ?? "Running a command";
    }
    case "toolCall":
      return pending ?? (text(entry.tool) ? `Running ${entry.tool}` : null);
    case "reasoning":
      return "Thinking";
    case "agentMessage":
      return "Writing";
    case "userMessage":
      return null;
    default:
      return pending;
  }
}

function isRateLimit(data: Loose): boolean {
  const info = record(data?.errorInfo);
  return info?.category === "rate-limit" || info?.httpStatusCode === 429;
}

const TOOL_ITEM_TYPES = new Set(["commandExecution", "toolCall", "delegation"]);

const turnIdOf = (row: SignalEventRow) => text(record(row.scope)?.turnId);

function isTopLevelCompletion(fold: SignalFold, turnId: string | null): boolean {
  if (turnId === null) return true;
  if (fold.nestedTurnIds.includes(turnId)) return false;
  return fold.turnId === null || fold.turnId === turnId;
}

export function foldSignalEvents(start: SignalFold, rows: readonly SignalEventRow[]): SignalFold {
  const fold = { ...start };
  for (const row of rows) {
    if (row.seq > fold.lastSeq) fold.lastSeq = row.seq;
    if (!NOT_PROGRESS.has(row.type) && row.createdAt > (fold.progressAt ?? -Infinity)) fold.progressAt = row.createdAt;
    const data = record(row.data);
    switch (row.type) {
      case "turn/started": {
        const turnId = turnIdOf(row);
        if (data?.parentToolCallId) {
          if (turnId) fold.nestedTurnIds = [...fold.nestedTurnIds, turnId];
          break;
        }
        fold.turnId = turnId;
        fold.nestedTurnIds = [];
        fold.openToolIds = [];
        fold.turnStartedAt = row.createdAt;
        fold.step = null;
        fold.rateLimitedAt = null;
        fold.turnSawRateLimit = false;
        break;
      }
      case "turn/completed": {
        const turnId = turnIdOf(row);
        if (!isTopLevelCompletion(fold, turnId)) {
          fold.nestedTurnIds = fold.nestedTurnIds.filter((id) => id !== turnId);
          break;
        }
        if (data?.status === "failed") {
          fold.failedTurnsInARow += 1;
          fold.lastFailureRateLimited = fold.turnSawRateLimit;
        } else if (data?.status === "completed") {
          fold.failedTurnsInARow = 0;
          fold.lastFailureRateLimited = false;
        }
        fold.turnId = null;
        fold.nestedTurnIds = [];
        fold.openToolIds = [];
        fold.turnStartedAt = null;
        fold.step = null;
        fold.rateLimitedAt = null;
        fold.turnSawRateLimit = false;
        break;
      }
      case "item/started": {
        const step = stepText(data?.item);
        if (step) fold.step = step;
        const item = record(data?.item);
        const id = text(item?.id);
        if (id && TOOL_ITEM_TYPES.has(String(item?.type)) && !fold.openToolIds.includes(id)) fold.openToolIds = [...fold.openToolIds, id];
        break;
      }
      case "item/completed": {
        const id = text(record(data?.item)?.id);
        if (id) fold.openToolIds = fold.openToolIds.filter((open) => open !== id);
        break;
      }
      case "provider/error":
        if (isRateLimit(data)) {
          fold.rateLimitedAt = row.createdAt;
          fold.turnSawRateLimit = true;
        }
        break;
      case "thread/contextWindowUsage/updated": {
        const usage = record(data?.contextWindowUsage);
        const used = usage?.usedTokens;
        const size = usage?.modelContextWindow;
        fold.context = typeof used === "number" && typeof size === "number" && size > 0 ? { usedTokens: used, windowTokens: size } : null;
        break;
      }
      case "thread/compacted":
      case "thread/context/cleared":
        fold.context = null;
        break;
    }
  }
  return fold;
}

/** The newest event that is the agent's own work; rows are newest first. */
export function lastProgressAt(newestFirst: readonly SignalEventRow[]): number | null {
  return newestFirst.find((row) => !NOT_PROGRESS.has(row.type))?.createdAt ?? null;
}

export function toThreadSignals(fold: SignalFold, progressAt: number | null): ThreadSignals {
  const latest = Math.max(progressAt ?? -Infinity, fold.progressAt ?? -Infinity);
  return {
    turnStartedAt: fold.turnStartedAt,
    step: fold.step,
    lastProgressAt: Number.isFinite(latest) ? latest : null,
    rateLimitedAt: fold.rateLimitedAt,
    failedTurnsInARow: fold.failedTurnsInARow,
    toolRunning: fold.turnStartedAt !== null && fold.openToolIds.length > 0,
    lastFailureRateLimited: fold.lastFailureRateLimited,
    context: fold.context,
  };
}

/** A live turn without progress for {@link STUCK_AFTER_MS}; waiting on the user or on its own command is not stuck. */
export function isStuck(
  thread: { status: string; hasPendingInteraction: boolean; indicator: string },
  signals: ThreadSignals | undefined,
  now: number,
): boolean {
  if (!signals || !RUNNING_STATUSES.has(thread.status) || signals.toolRunning) return false;
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return false;
  const since = silentSince(signals);
  return since !== null && now - since >= STUCK_AFTER_MS;
}

export function silentSince(signals: ThreadSignals): number | null {
  return signals.lastProgressAt ?? signals.turnStartedAt;
}

export function contextPercent(context: ThreadSignals["context"]): number | null {
  if (!context || context.windowTokens <= 0) return null;
  return Math.round((context.usedTokens / context.windowTokens) * 100);
}

export function isRateLimited(signals: ThreadSignals): boolean {
  return signals.rateLimitedAt !== null && signals.rateLimitedAt >= (signals.lastProgressAt ?? 0);
}

/** The Running list's second line. */
export function runningSubtitle(signals: ThreadSignals | undefined, projectName: string | null, parentTitle: string | null): string {
  const percent = signals ? contextPercent(signals.context) : null;
  return [
    signals ? (isRateLimited(signals) ? "Rate limited" : signals.step) : null,
    percent !== null && percent >= CONTEXT_NOTE_PERCENT ? `${percent}% context` : null,
    runningContext(projectName, parentTitle),
  ].filter(Boolean).join(" · ");
}

/** What a failed item adds to its reason. */
export function failureNote(signals: ThreadSignals | undefined): string | null {
  if (!signals) return null;
  if (signals.failedTurnsInARow >= FAILURES_IN_A_ROW_NOTE) return `failed ${signals.failedTurnsInARow} times in a row`;
  return signals.lastFailureRateLimited ? "rate limit" : null;
}

/** Tooltip lines for a row: what the turn is doing and for how long, its context fill, a rate limit. */
export function signalTooltipLines(signals: ThreadSignals | undefined, now: number): string[] {
  if (!signals) return [];
  const percent = contextPercent(signals.context);
  return [
    signals.turnStartedAt !== null ? `Turn running ${formatClock(now - signals.turnStartedAt)}${signals.step ? ` · ${signals.step}` : ""}` : null,
    isRateLimited(signals) && signals.turnStartedAt !== null ? "Rate limited, waiting to retry" : null,
    percent !== null ? `Context ${percent}% full` : null,
  ].filter((line): line is string => line !== null);
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export interface SignalListArgs {
  threadId: string;
  types?: readonly [string, ...string[]];
  order: "asc" | "desc";
  afterSeq?: string;
  beforeSeq?: string;
  limit: string;
}

const PAGE_SIZE = 100;
/** A long thread's first read looks this far back; older failures don't change today's signals. */
const FIRST_READ_PAGES = 3;
const PROGRESS_WINDOW = 25;
/** A long turn's start, and the failed turns before it, can sit behind the first read's pages. */
const TURN_BOUNDARY_TYPES = ["turn/started", "turn/completed"] as const;
const TURN_BOUNDARY_LOOKBACK = 50;
const MAX_CACHED_THREADS = 400;

/** `events.list` calls in flight at once across every thread's read. */
export const SIGNAL_READ_CONCURRENCY = 4;

function createLimiter(limit: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    running++;
    try {
      return await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

interface ReaderEntry {
  /** null until a first read succeeds; the entry alone keeps the thread watched. */
  fold: SignalFold | null;
  pending: Promise<ThreadSignals> | null;
  /** A read that came during `pending`; it reloads once that load ends, so it sees what triggered it. */
  next: Promise<ThreadSignals> | null;
}

/** Per-thread folds: the first read looks back a few pages, later reads take only newer events. */
export function createSignalReader(deps: { listEvents: (args: SignalListArgs) => Promise<readonly SignalEventRow[]>; log: (message: string) => void }) {
  const entries = new Map<string, ReaderEntry>();
  const progressAt = new Map<string, number>();
  const limit = createLimiter(SIGNAL_READ_CONCURRENCY);
  const listEvents = (args: SignalListArgs) => limit(() => deps.listEvents(args));

  async function firstFold(threadId: string): Promise<SignalFold> {
    const newestFirst: SignalEventRow[] = [];
    let before: number | null = null;
    let complete = false;
    for (let page = 0; page < FIRST_READ_PAGES && !complete; page++) {
      const rows = await listEvents({ threadId, types: SIGNAL_EVENT_TYPES, order: "desc", limit: String(PAGE_SIZE), ...(before !== null ? { beforeSeq: String(before) } : {}) });
      newestFirst.push(...rows);
      complete = rows.length < PAGE_SIZE;
      if (!complete) before = rows.at(-1)!.seq;
    }
    const boundaries = complete || before === null
      ? []
      : await listEvents({ threadId, types: TURN_BOUNDARY_TYPES, order: "desc", limit: String(TURN_BOUNDARY_LOOKBACK), beforeSeq: String(before) });
    return foldSignalEvents(emptySignalFold(), [...newestFirst, ...boundaries].reverse());
  }

  async function catchUp(threadId: string, fold: SignalFold): Promise<SignalFold> {
    let next = fold;
    for (;;) {
      const rows = await listEvents({ threadId, types: SIGNAL_EVENT_TYPES, order: "asc", afterSeq: String(next.lastSeq), limit: String(PAGE_SIZE) });
      next = foldSignalEvents(next, rows);
      if (rows.length < PAGE_SIZE) return next;
    }
  }

  async function load(threadId: string, entry: ReaderEntry): Promise<ThreadSignals> {
    const fold = entry.fold ? await catchUp(threadId, entry.fold) : await firstFold(threadId);
    const newest = await listEvents({ threadId, order: "desc", limit: String(PROGRESS_WINDOW) });
    if (entries.get(threadId) !== entry) return toThreadSignals(fold, lastProgressAt(newest));
    entry.fold = fold;
    entries.delete(threadId);
    entries.set(threadId, entry);
    while (entries.size > MAX_CACHED_THREADS) {
      const oldest = entries.keys().next().value!;
      entries.delete(oldest);
      progressAt.delete(oldest);
    }
    const at = lastProgressAt(newest) ?? progressAt.get(threadId) ?? null;
    if (at !== null) progressAt.set(threadId, at);
    return toThreadSignals(fold, at);
  }

  function start(threadId: string, entry: ReaderEntry): Promise<ThreadSignals> {
    const pending = load(threadId, entry)
      .catch((error: unknown) => {
        deps.log(`signals failed for ${threadId}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      })
      .finally(() => {
        if (entry.pending === pending) entry.pending = null;
      });
    entry.pending = pending;
    return pending;
  }

  return {
    read(threadId: string): Promise<ThreadSignals> {
      let entry = entries.get(threadId);
      if (!entry) {
        entry = { fold: null, pending: null, next: null };
        entries.set(threadId, entry);
      }
      const inFlight = entry.pending;
      if (!inFlight) return start(threadId, entry);
      const current = entry;
      current.next ??= inFlight.catch(() => {}).then(() => {
        current.next = null;
        return current.pending ?? start(threadId, current);
      });
      return current.next;
    },
    has: (threadId: string) => entries.has(threadId),
    forget(threadId: string) {
      entries.delete(threadId);
      progressAt.delete(threadId);
    },
  };
}
