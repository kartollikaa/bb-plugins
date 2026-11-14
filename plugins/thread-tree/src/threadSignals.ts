// What a thread's own event log says about its current turn: step, timer, progress, context fill, rate limits, failures.
import { z } from "zod";

/** Owner's rule: a working thread with no progress for this long is stuck, whatever its role. */
export const STUCK_AFTER_MS = 30 * 60_000;
/** From here the Running list names the context fill. */
export const CONTEXT_NOTE_PERCENT = 80;
export const FAILURES_IN_A_ROW_NOTE = 3;

export const SIGNAL_EVENT_TYPES = [
  "turn/started",
  "turn/completed",
  "item/started",
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
}

export const threadSignalsSchema = z.object({
  turnStartedAt: z.number().nullable(),
  step: z.string().nullable(),
  lastProgressAt: z.number().nullable(),
  /** A rate-limit error in the running turn; progress after it means it passed. */
  rateLimitedAt: z.number().nullable(),
  failedTurnsInARow: z.number(),
  lastFailureRateLimited: z.boolean(),
  context: z.object({ usedTokens: z.number(), windowTokens: z.number() }).nullable(),
});
export type ThreadSignals = z.infer<typeof threadSignalsSchema>;

export interface SignalFold {
  lastSeq: number;
  turnStartedAt: number | null;
  step: string | null;
  rateLimitedAt: number | null;
  turnSawRateLimit: boolean;
  failedTurnsInARow: number;
  lastFailureRateLimited: boolean;
  context: ThreadSignals["context"];
}

export function emptySignalFold(): SignalFold {
  return { lastSeq: 0, turnStartedAt: null, step: null, rateLimitedAt: null, turnSawRateLimit: false, failedTurnsInARow: 0, lastFailureRateLimited: false, context: null };
}

type Loose = Record<string, unknown> | null | undefined;
const record = (value: unknown): Loose => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const firstLine = (value: string) => value.trim().split("\n")[0]!.trim();

/** A started item in a few words, as bb's own timeline labels it; null for items that aren't a step. */
export function stepText(item: unknown): string | null {
  const entry = record(item);
  if (!entry) return null;
  const presentation = record(entry.presentation);
  if (presentation?.suppress === true) return null;
  const pending = text(record(presentation?.label)?.pending);
  switch (entry.type) {
    case "commandExecution": {
      const command = text(presentation?.title) ?? text(entry.command);
      return command ? `Running ${firstLine(command)}` : pending ?? "Running a command";
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

export function foldSignalEvents(start: SignalFold, rows: readonly SignalEventRow[]): SignalFold {
  const fold = { ...start };
  for (const row of rows) {
    if (row.seq > fold.lastSeq) fold.lastSeq = row.seq;
    const data = record(row.data);
    switch (row.type) {
      case "turn/started":
        if (data?.parentToolCallId) break;
        fold.turnStartedAt = row.createdAt;
        fold.step = null;
        fold.rateLimitedAt = null;
        fold.turnSawRateLimit = false;
        break;
      case "turn/completed":
        if (data?.status === "failed") {
          fold.failedTurnsInARow += 1;
          fold.lastFailureRateLimited = fold.turnSawRateLimit;
        } else if (data?.status === "completed") {
          fold.failedTurnsInARow = 0;
          fold.lastFailureRateLimited = false;
        }
        fold.turnStartedAt = null;
        fold.step = null;
        fold.rateLimitedAt = null;
        fold.turnSawRateLimit = false;
        break;
      case "item/started": {
        const step = stepText(data?.item);
        if (step) fold.step = step;
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
  return {
    turnStartedAt: fold.turnStartedAt,
    step: fold.step,
    lastProgressAt: progressAt,
    rateLimitedAt: fold.rateLimitedAt,
    failedTurnsInARow: fold.failedTurnsInARow,
    lastFailureRateLimited: fold.lastFailureRateLimited,
    context: fold.context,
  };
}

const LIVE_STATUSES = new Set(["starting", "active", "stopping"]);

/** A live turn without progress for {@link STUCK_AFTER_MS}; a thread waiting on the user is input, not stuck. */
export function isStuck(
  thread: { status: string; hasPendingInteraction: boolean; indicator: string },
  signals: ThreadSignals | undefined,
  now: number,
): boolean {
  if (!signals || !LIVE_STATUSES.has(thread.status)) return false;
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
    projectName,
    parentTitle ? `under ${parentTitle}` : null,
  ].filter(Boolean).join(" · ");
}

/** What a failed item adds to its reason. */
export function failureNote(signals: ThreadSignals | undefined): string | null {
  if (!signals) return null;
  if (signals.failedTurnsInARow >= FAILURES_IN_A_ROW_NOTE) return `failed ${signals.failedTurnsInARow} times in a row`;
  return signals.lastFailureRateLimited ? "rate limit" : null;
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
const MAX_CACHED_THREADS = 400;

/** Per-thread folds: the first read looks back a few pages, later reads take only newer events. */
export function createSignalReader(deps: { listEvents: (args: SignalListArgs) => Promise<readonly SignalEventRow[]>; log: (message: string) => void }) {
  const folds = new Map<string, { fold: SignalFold; pending: Promise<ThreadSignals> | null }>();
  const progressAt = new Map<string, number>();

  async function firstFold(threadId: string): Promise<SignalFold> {
    const newestFirst: SignalEventRow[] = [];
    let before: number | null = null;
    for (let page = 0; page < FIRST_READ_PAGES; page++) {
      const rows = await deps.listEvents({ threadId, types: SIGNAL_EVENT_TYPES, order: "desc", limit: String(PAGE_SIZE), ...(before !== null ? { beforeSeq: String(before) } : {}) });
      newestFirst.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      before = rows.at(-1)!.seq;
    }
    return foldSignalEvents(emptySignalFold(), newestFirst.reverse());
  }

  async function catchUp(threadId: string, fold: SignalFold): Promise<SignalFold> {
    let next = fold;
    for (;;) {
      const rows = await deps.listEvents({ threadId, types: SIGNAL_EVENT_TYPES, order: "asc", afterSeq: String(next.lastSeq), limit: String(PAGE_SIZE) });
      next = foldSignalEvents(next, rows);
      if (rows.length < PAGE_SIZE) return next;
    }
  }

  async function load(threadId: string, entry: { fold: SignalFold } | undefined): Promise<ThreadSignals> {
    const fold = entry ? await catchUp(threadId, entry.fold) : await firstFold(threadId);
    const newest = await deps.listEvents({ threadId, order: "desc", limit: String(PROGRESS_WINDOW) });
    const known = folds.get(threadId);
    folds.delete(threadId);
    folds.set(threadId, { fold, pending: known?.pending ?? null });
    while (folds.size > MAX_CACHED_THREADS) {
      const oldest = folds.keys().next().value!;
      folds.delete(oldest);
      progressAt.delete(oldest);
    }
    const previous = progressAt.get(threadId) ?? null;
    const at = lastProgressAt(newest) ?? previous;
    if (at !== null) progressAt.set(threadId, at);
    return toThreadSignals(fold, at);
  }
  return {
    read(threadId: string): Promise<ThreadSignals> {
      const entry = folds.get(threadId);
      if (entry?.pending) return entry.pending;
      const pending = load(threadId, entry)
        .catch((error: unknown) => {
          deps.log(`signals failed for ${threadId}: ${error instanceof Error ? error.message : String(error)}`);
          if (!entry) folds.delete(threadId);
          throw error;
        })
        .finally(() => {
          const current = folds.get(threadId);
          if (current) current.pending = null;
        });
      if (entry) entry.pending = pending;
      else folds.set(threadId, { fold: emptySignalFold(), pending });
      return pending;
    },
    has: (threadId: string) => folds.has(threadId),
    forget(threadId: string) {
      folds.delete(threadId);
      progressAt.delete(threadId);
    },
  };
}
