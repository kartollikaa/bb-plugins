// Folds a thread's event log into its subagent list. Provider events are
// parsed loosely: an unknown shape is skipped, never thrown on.
//
// A subagent is a `delegation` item: `item/started` opens it, and
// `item/completed` or `item/delegation/completed` closes it. A background
// delegation closes as soon as it launches; its real progress arrives on
// `backgroundTask` items whose `parentToolCallId` names the delegation.
import { z } from "zod";

export const subagentStateSchema = z.enum(["running", "completed", "failed", "stopped"]);
export type SubagentState = z.infer<typeof subagentStateSchema>;

export const subagentSchema = z.object({
  id: z.string(),
  label: z.string(),
  agentType: z.string().nullable(),
  background: z.boolean(),
  state: subagentStateSchema,
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  totalTokens: z.number().nullable(),
  toolUses: z.number().nullable(),
});
export type Subagent = z.infer<typeof subagentSchema>;

export const SUBAGENT_EVENT_TYPES = [
  "item/started",
  "item/completed",
  "item/delegation/completed",
  "item/backgroundTask/progress",
  "item/backgroundTask/completed",
] as const;

/** The newest subagents a read returns; `total` still counts every one. */
export const MAX_SUBAGENTS_PER_THREAD = 40;
/** The SDK refuses a larger page. */
export const PAGE_SIZE = 100;
const MAX_CACHED_THREADS = 400;

export interface EventRow {
  seq: number;
  type: string;
  createdAt: number;
  data: unknown;
}

export interface ListEventsArgs {
  threadId: string;
  types: typeof SUBAGENT_EVENT_TYPES;
  order: "asc";
  afterSeq?: string;
  limit: string;
}

const itemSchema = z
  .object({
    type: z.string(),
    id: z.string(),
  })
  .passthrough();

const delegationSchema = z.object({
  type: z.literal("delegation"),
  id: z.string(),
  label: z.string().nullish(),
  status: z.string().nullish(),
  background: z.boolean().nullish(),
  presentation: z
    .object({ title: z.string().nullish(), detail: z.string().nullish() })
    .passthrough()
    .nullish(),
});

const backgroundTaskSchema = z.object({
  type: z.literal("backgroundTask"),
  id: z.string(),
  taskType: z.string().nullish(),
  taskStatus: z.string().nullish(),
  parentToolCallId: z.string().nullish(),
  usage: z
    .object({ totalTokens: z.number().nullish(), toolUses: z.number().nullish() })
    .passthrough()
    .nullish(),
});

interface ThreadFold {
  lastSeq: number;
  byId: Map<string, Subagent>;
  /** backgroundTask id → delegation id, for tasks that carry no parent on a later event. */
  taskOwner: Map<string, string>;
  pending: Promise<void> | null;
}

/** "general-purpose agent · model opus" → "general-purpose". */
export function agentTypeFrom(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const head = detail.split(/\s+·\s+/)[0] ?? "";
  return head.replace(/\s+agent$/i, "").trim() || null;
}

function closedState(status: string | null | undefined): SubagentState {
  if (status === "error") return "failed";
  if (status === "interrupted") return "stopped";
  return "completed";
}

function taskState(taskStatus: string | null | undefined): SubagentState | null {
  switch (taskStatus) {
    case "pending":
    case "running":
    case "paused":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "killed":
    case "stopped":
      return "stopped";
    default:
      return null;
  }
}

export function applyEvent(fold: ThreadFold, row: EventRow): void {
  const data = row.data as { item?: unknown } | null;
  const parsedItem = itemSchema.safeParse(data?.item);
  if (!parsedItem.success) return;
  const item = parsedItem.data;

  if (item.type === "delegation") {
    const parsed = delegationSchema.safeParse(item);
    if (!parsed.success) return;
    const delegation = parsed.data;
    const existing = fold.byId.get(delegation.id);
    const label =
      delegation.label?.trim() || delegation.presentation?.title?.trim() || existing?.label || "Subagent";
    const agentType = agentTypeFrom(delegation.presentation?.detail) ?? existing?.agentType ?? null;
    const background = delegation.background ?? existing?.background ?? false;
    if (row.type === "item/started" || existing === undefined) {
      fold.byId.set(delegation.id, {
        id: delegation.id,
        label,
        agentType,
        background,
        state: "running",
        startedAt: row.createdAt,
        endedAt: null,
        totalTokens: null,
        toolUses: null,
      });
      if (row.type === "item/started") return;
    }
    const current = fold.byId.get(delegation.id)!;
    const linkedTask = [...fold.taskOwner.values()].includes(delegation.id);
    // A launched background agent keeps the state its task reports.
    if (background && linkedTask) {
      fold.byId.set(delegation.id, { ...current, label, agentType, background });
      return;
    }
    fold.byId.set(delegation.id, {
      ...current,
      label,
      agentType,
      background,
      state: closedState(delegation.status),
      endedAt: row.createdAt,
    });
    return;
  }

  if (item.type === "backgroundTask") {
    const parsed = backgroundTaskSchema.safeParse(item);
    if (!parsed.success) return;
    const task = parsed.data;
    if (task.taskType && task.taskType !== "local_agent") return;
    const ownerId = task.parentToolCallId ?? fold.taskOwner.get(task.id);
    if (!ownerId) return;
    fold.taskOwner.set(task.id, ownerId);
    const owner = fold.byId.get(ownerId);
    if (!owner) return;
    const state = taskState(task.taskStatus) ?? owner.state;
    fold.byId.set(ownerId, {
      ...owner,
      background: true,
      state,
      endedAt: state === "running" ? null : row.type === "item/backgroundTask/completed" ? row.createdAt : owner.endedAt,
      totalTokens: task.usage?.totalTokens ?? owner.totalTokens,
      toolUses: task.usage?.toolUses ?? owner.toolUses,
    });
  }
}

export function createSubagentFolder(deps: {
  listEvents: (args: ListEventsArgs) => Promise<readonly EventRow[]>;
  log: (message: string) => void;
}) {
  const folds = new Map<string, ThreadFold>();

  function foldFor(threadId: string): ThreadFold {
    let fold = folds.get(threadId);
    if (fold) {
      // Map insertion order doubles as recency for eviction.
      folds.delete(threadId);
      folds.set(threadId, fold);
      return fold;
    }
    fold = { lastSeq: 0, byId: new Map(), taskOwner: new Map(), pending: null };
    folds.set(threadId, fold);
    while (folds.size > MAX_CACHED_THREADS) {
      const oldest = folds.keys().next().value;
      if (oldest === undefined) break;
      folds.delete(oldest);
    }
    return fold;
  }

  async function catchUp(threadId: string, fold: ThreadFold): Promise<void> {
    for (;;) {
      const rows = await deps.listEvents({
        threadId,
        types: SUBAGENT_EVENT_TYPES,
        order: "asc",
        afterSeq: fold.lastSeq > 0 ? String(fold.lastSeq) : undefined,
        limit: String(PAGE_SIZE),
      });
      for (const row of rows) {
        applyEvent(fold, row);
        if (row.seq > fold.lastSeq) fold.lastSeq = row.seq;
      }
      if (rows.length < PAGE_SIZE) return;
    }
  }

  async function read(threadId: string): Promise<{ total: number; subagents: Subagent[] }> {
    const fold = foldFor(threadId);
    if (!fold.pending) {
      fold.pending = catchUp(threadId, fold)
        .catch((error: unknown) => {
          deps.log(`subagent fold failed for ${threadId}: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        })
        .finally(() => {
          fold.pending = null;
        });
    }
    await fold.pending;
    const all = [...fold.byId.values()].sort((a, b) => b.startedAt - a.startedAt);
    return { total: all.length, subagents: all.slice(0, MAX_SUBAGENTS_PER_THREAD) };
  }

  return {
    read,
    forget: (threadId: string) => void folds.delete(threadId),
  };
}
