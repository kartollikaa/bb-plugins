// What a thread's running turn is doing now: its start, current step and background commands, folded from its typed events.
// The fold, `stepText`, `commandGist` and the paging are copied from plugins/thread-tree/src/threadSignals.ts: plugins stay independent.
import type { ThreadActivity } from "./contract.ts";

export const ACTIVITY_EVENT_TYPES = [
  "turn/started",
  "turn/completed",
  "item/started",
  "item/completed",
  "item/backgroundTask/progress",
  "item/backgroundTask/completed",
] as const;

export interface ActivityEventRow {
  seq: number;
  type: string;
  createdAt: number;
  data: unknown;
  scope?: unknown;
}

export interface ActivityFold {
  lastSeq: number;
  turnId: string | null;
  /** Subagent turns started since the top-level one; their completions carry no parent marker. */
  nestedTurnIds: readonly string[];
  turnStartedAt: number | null;
  lastTurnStartedAt: number | null;
  /** Started items that have a step label and no completion yet, oldest first. */
  openSteps: readonly { id: string; step: string; startedAt: number }[];
  background: readonly { id: string; description: string; startedAt: number }[];
}

export function emptyActivityFold(): ActivityFold {
  return { lastSeq: 0, turnId: null, nestedTurnIds: [], turnStartedAt: null, lastTurnStartedAt: null, openSteps: [], background: [] };
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
const SHELL_WRAPPER = /^(?:\S*\/)?(?:ba|z)?sh\s+-l?c\s+(["'])(.*?)\1?\s*$/;

export function commandGist(command: string): string {
  const line = firstLine(command);
  const wrapped = SHELL_WRAPPER.exec(line);
  if (wrapped?.[2]) return commandGist(wrapped[2]);
  const commands = shellParts(line).map(withoutAssignments).filter((words) => words.length > 0 && words[0] !== "cd");
  if (!commands[0]) return line;
  const redirect = commands[0].findIndex((word) => /^\d*[<>]/.test(word));
  return commands[0].slice(0, redirect === -1 ? undefined : redirect).slice(0, GIST_WORDS).join(" ");
}

/** A line split at `&&`, `||`, `;` and `|` outside quotes. */
function shellParts(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (quote) {
      if (char === quote) quote = null;
      current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      current += char;
    } else if (char === ";" || char === "|" || (char === "&" && line[index + 1] === "&")) {
      parts.push(current);
      current = "";
      if (line[index + 1] === char) index++;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
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

const turnIdOf = (row: ActivityEventRow) => text(record(row.scope)?.turnId);

function isTopLevelCompletion(fold: ActivityFold, turnId: string | null): boolean {
  if (turnId === null) return true;
  if (fold.nestedTurnIds.includes(turnId)) return false;
  return fold.turnId === null || fold.turnId === turnId;
}

export function foldActivityEvents(start: ActivityFold, rows: readonly ActivityEventRow[]): ActivityFold {
  const fold = { ...start };
  for (const row of rows) {
    if (row.seq > fold.lastSeq) fold.lastSeq = row.seq;
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
        fold.openSteps = [];
        fold.turnStartedAt = row.createdAt;
        fold.lastTurnStartedAt = row.createdAt;
        break;
      }
      case "turn/completed": {
        const turnId = turnIdOf(row);
        if (!isTopLevelCompletion(fold, turnId)) {
          fold.nestedTurnIds = fold.nestedTurnIds.filter((id) => id !== turnId);
          break;
        }
        fold.turnId = null;
        fold.nestedTurnIds = [];
        fold.openSteps = [];
        fold.turnStartedAt = null;
        break;
      }
      case "item/started": {
        const item = record(data?.item);
        const id = text(item?.id);
        const step = stepText(item);
        if (id && step && !fold.openSteps.some((open) => open.id === id)) fold.openSteps = [...fold.openSteps, { id, step, startedAt: row.createdAt }];
        break;
      }
      case "item/completed": {
        const id = text(record(data?.item)?.id);
        if (id) fold.openSteps = fold.openSteps.filter((open) => open.id !== id);
        break;
      }
      case "item/backgroundTask/progress": {
        const item = record(data?.item);
        const id = text(item?.id);
        const taskType = text(item?.taskType);
        const description = text(item?.description) ?? text(record(record(item?.presentation)?.label)?.pending) ?? text(record(item?.presentation)?.title);
        if (id && description && (taskType === null || taskType === "local_bash") && !fold.background.some((task) => task.id === id)) {
          fold.background = [...fold.background, { id, description: firstLine(description), startedAt: row.createdAt }];
        }
        break;
      }
      case "item/backgroundTask/completed": {
        const id = text(record(data?.item)?.id);
        if (id) fold.background = fold.background.filter((task) => task.id !== id);
        break;
      }
    }
  }
  return fold;
}

export function toThreadActivity(fold: ActivityFold): ThreadActivity {
  const open = fold.turnStartedAt !== null ? fold.openSteps.at(-1) : undefined;
  return {
    turnStartedAt: fold.turnStartedAt,
    lastTurnStartedAt: fold.lastTurnStartedAt,
    step: open?.step ?? null,
    stepStartedAt: open?.startedAt ?? null,
    background: fold.background.map(({ description, startedAt }) => ({ description, startedAt })),
  };
}

export interface ActivityListArgs {
  threadId: string;
  types: readonly [string, ...string[]];
  order: "asc" | "desc";
  afterSeq?: string;
  beforeSeq?: string;
  limit: string;
}

const PAGE_SIZE = 100;
const FIRST_READ_PAGES = 3;
/** A long turn's start can sit behind the first read's pages. */
const TURN_BOUNDARY_TYPES = ["turn/started", "turn/completed"] as const;
const TURN_BOUNDARY_LOOKBACK = 50;
const MAX_CACHED_THREADS = 400;

/** `events.list` calls in flight at once across every thread's read. */
export const ACTIVITY_READ_CONCURRENCY = 4;

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

/** Per-thread folds: the first read looks back a few pages, later reads take only events after the last seq. */
export function createActivityReader(deps: { listEvents: (args: ActivityListArgs) => Promise<readonly ActivityEventRow[]>; log: (message: string) => void }) {
  const folds = new Map<string, ActivityFold>();
  const inFlight = new Map<string, Promise<ThreadActivity>>();
  const failing = new Set<string>();
  const limit = createLimiter(ACTIVITY_READ_CONCURRENCY);
  const listEvents = (args: ActivityListArgs) => limit(() => deps.listEvents(args));

  async function firstFold(threadId: string): Promise<ActivityFold> {
    const newestFirst: ActivityEventRow[] = [];
    let before: number | null = null;
    let complete = false;
    for (let page = 0; page < FIRST_READ_PAGES && !complete; page++) {
      const rows = await listEvents({ threadId, types: ACTIVITY_EVENT_TYPES, order: "desc", limit: String(PAGE_SIZE), ...(before !== null ? { beforeSeq: String(before) } : {}) });
      newestFirst.push(...rows);
      complete = rows.length < PAGE_SIZE;
      if (!complete) before = rows.at(-1)!.seq;
    }
    const boundaries = complete || before === null
      ? []
      : await listEvents({ threadId, types: TURN_BOUNDARY_TYPES, order: "desc", limit: String(TURN_BOUNDARY_LOOKBACK), beforeSeq: String(before) });
    return foldActivityEvents(emptyActivityFold(), [...newestFirst, ...boundaries].sort((a, b) => a.seq - b.seq));
  }

  async function catchUp(threadId: string, fold: ActivityFold): Promise<ActivityFold> {
    let next = fold;
    for (;;) {
      const rows = await listEvents({ threadId, types: ACTIVITY_EVENT_TYPES, order: "asc", afterSeq: String(next.lastSeq), limit: String(PAGE_SIZE) });
      next = foldActivityEvents(next, rows);
      if (rows.length < PAGE_SIZE) return next;
    }
  }

  async function load(threadId: string): Promise<ThreadActivity> {
    const known = folds.get(threadId);
    const fold = known ? await catchUp(threadId, known) : await firstFold(threadId);
    folds.delete(threadId);
    folds.set(threadId, fold);
    while (folds.size > MAX_CACHED_THREADS) folds.delete(folds.keys().next().value!);
    return toThreadActivity(fold);
  }

  return {
    /** Reads run one at a time per thread; a read asked for during another waits for it and then catches up again. */
    read(threadId: string): Promise<ThreadActivity> {
      const previous = inFlight.get(threadId) ?? Promise.resolve(null as unknown as ThreadActivity);
      const next = previous.catch(() => null).then(() => load(threadId)).then(
        (activity) => {
          failing.delete(threadId);
          return activity;
        },
        (error: unknown) => {
          if (!failing.has(threadId)) deps.log(`activity failed for ${threadId}: ${error instanceof Error ? error.message : String(error)}`);
          failing.add(threadId);
          throw error;
        },
      );
      inFlight.set(threadId, next);
      void next.then(() => undefined, () => undefined).then(() => {
        if (inFlight.get(threadId) === next) inFlight.delete(threadId);
      });
      return next;
    },
    has: (threadId: string) => folds.has(threadId),
  };
}

/** At most one refresh per thread this often; bb already coalesces its events to one a second. */
export const ACTIVITY_REFRESH_MS = 2_000;
export const activityTag = (threadId: string) => `activity:${threadId}`;

/** Invalidates `activity:<id>` once per window, only for threads whose fold exists. */
export function createRefreshScheduler(deps: { has: (threadId: string) => boolean; invalidate: (tags: string[]) => void; ms?: number }) {
  const scheduled = new Map<string, ReturnType<typeof setTimeout>>();
  return (threadId: string) => {
    if (!deps.has(threadId) || scheduled.has(threadId)) return;
    scheduled.set(threadId, setTimeout(() => {
      scheduled.delete(threadId);
      deps.invalidate([activityTag(threadId)]);
    }, deps.ms ?? ACTIVITY_REFRESH_MS));
  };
}
