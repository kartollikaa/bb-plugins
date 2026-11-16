import { z } from "zod";

export const subtaskSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  /** The role column's role name (`researcher`, `reviewer`, …). */
  role: z.string().nullable().optional(),
  delivery: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  areas: z.string().nullable().optional(),
  criteria: z.array(z.string()).optional(),
  evidence: z.array(z.object({ label: z.string(), text: z.string() })).optional(),
  /** The bb thread id of the subtask's current session, when the ledger names one. */
  threadId: z.string().nullable(),
  status: z.string().nullable(),
  statusRaw: z.string().nullable(),
  modelRaw: z.string().nullable(),
  dependsOn: z.array(z.string()),
  dependencyNote: z.string().nullable().optional(),
  /** One line for the row detail, null when the subtask has no gate entry. */
  gateLine: z.string().nullable(),
  /** Failed checks/review/done-when/conflicts stages across the subtask's open gates. */
  gateFailures: z.number().int(),
  /** The kind that failed last, e.g. "review". */
  lastFailedKind: z.string().nullable(),
  rotations: z.number().int(),
});
export type Subtask = z.infer<typeof subtaskSchema>;

export const ledgerSummarySchema = z.object({
  path: z.string(),
  goal: z.string().nullable(),
  status: z.string().nullable(),
  statusRaw: z.string().nullable().optional(),
  brief: z.string().nullable().optional(),
  subtasks: z.array(subtaskSchema),
  forTheOwner: z.array(z.string()),
  orchestratorSessions: z.number().int(),
  lastHandover: z.object({ why: z.string().nullable(), at: z.string().nullable() }).nullable(),
  warnings: z.array(z.string()),
  /** «Current checkpoint» and the newest «Decision journal» row: what the recap says is happening now. */
  checkpoint: z.object({ text: z.string(), at: z.string().nullable() }).nullable(),
  lastDecision: z.object({ text: z.string(), at: z.string().nullable() }).nullable(),
  /** «Landing queue» lines in order, `<id> — <what>; …`: the Plan's step order. */
  landingQueue: z.array(z.string()).optional(),
  /** Decision journal rows in file order. */
  journal: z.array(z.object({ text: z.string(), at: z.string().nullable(), by: z.string().nullable() })).optional(),
  /** The Now block of «Current checkpoint»; null when the export predates it (no `structured` key). */
  now: z.object({
    structured: z.boolean(),
    updated: z.string().nullable(),
    doing: z.string().nullable(),
    waitingOn: z.array(z.object({ who: z.string(), subtask: z.string().nullable(), what: z.string(), since: z.string().nullable() })),
    next: z.string().nullable(),
    blockedBy: z.string().nullable(),
    /** The checkpoint's `background wait:` lines. */
    backgroundWaits: z.array(z.string()),
  }).nullable().optional(),
  workflow: z.array(z.object({
    kind: z.enum(["decision", "gate", "handover"]),
    task: z.string().nullable(),
    title: z.string(),
    detail: z.string().nullable(),
    at: z.string().nullable(),
  })).optional(),
});
export type LedgerSummary = z.infer<typeof ledgerSummarySchema>;

/** What a thread's running turn is doing now, from its event log. Times are epoch ms. */
export const threadActivitySchema = z.object({
  turnStartedAt: z.number().nullable(),
  lastTurnStartedAt: z.number().nullable(),
  step: z.string().nullable(),
  stepStartedAt: z.number().nullable(),
  background: z.array(z.object({ description: z.string(), startedAt: z.number() })),
});
export type ThreadActivity = z.infer<typeof threadActivitySchema>;

export const agentSchema = z.object({
  model: z.string().nullable(),
  effort: z.string().nullable(),
  contextUsed: z.number().nullable(),
  contextWindow: z.number().nullable(),
  /** The agent's last assistant text, trimmed. */
  lastOutput: z.string().nullable(),
  /** When the agent last finished a turn (bb's latestAttentionAt), epoch ms. */
  lastReportAt: z.number().nullable(),
  /** When bb archived the agent's thread, epoch ms. */
  archivedAt: z.number().nullable().optional(),
});
export type Agent = z.infer<typeof agentSchema>;

/** A bb interaction waiting in a thread: an agent's question or a request to approve. */
export const pendingSchema = z.object({
  kind: z.enum(["question", "approval"]),
  title: z.string(),
  text: z.string(),
});
export type Pending = z.infer<typeof pendingSchema>;

export const snapshotSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }),
  z.object({ state: z.literal("error"), message: z.string() }),
  z.object({
    state: z.literal("ledger"),
    ledger: ledgerSummarySchema,
    agents: z.record(z.string(), agentSchema),
    /** Ask title → the owner's `Re «title»: …` reply in the orchestrator chat since that ask line appeared. */
    answered: z.record(z.string(), z.object({ answer: z.string(), at: z.number() })),
    /** Ask title → since when a reply to it counts, epoch ms. */
    askFirstSeen: z.record(z.string(), z.number()),
    workspace: z.object({ environmentId: z.string(), rootPath: z.string(), hostId: z.string(), ledgerHostId: z.string().nullable(), storageRootPath: z.string().nullable() }).nullable().optional(),
    report: z.object({ text: z.string(), truncated: z.boolean() }).nullable().optional(),
    /** Child thread id → the first message its orchestrator sent it, for a child the ledger doesn't name yet. */
    briefs: z.record(z.string(), z.string()).optional(),
    /** The ledger file's modification time, epoch ms. */
    ledgerModifiedAt: z.number().nullable().optional(),
    readAt: z.number(),
  }),
]);
export type Snapshot = z.infer<typeof snapshotSchema>;

/** Shared by server.ts and the app; schema objects only, so the app bundle never imports the server SDK. */
export const contract = {
  orchestrators: {
    input: z.object({}),
    output: z.object({ ids: z.array(z.string()) }),
  },
  owner: {
    input: z.object({ threadId: z.string().regex(/^thr_[a-z0-9]+$/i) }),
    output: z.object({ owner: z.string().nullable() }),
  },
  isOrchestrator: {
    input: z.object({ keys: z.array(z.string().min(1)).min(1).max(200) }),
    output: z.record(z.string(), z.boolean()),
  },
  snapshot: {
    input: z.object({ threadId: z.string().min(1).max(100) }),
    output: snapshotSchema,
  },
  reply: {
    input: z.object({ threadId: z.string().min(1).max(100), text: z.string().min(1).max(8_000) }),
    output: z.object({ delivery: z.enum(["sent", "queued", "already"]) }),
  },
  pending: {
    input: z.object({ threadId: z.string().min(1).max(100), threadIds: z.array(z.string().regex(/^thr_[a-z0-9]+$/i)).max(50) }),
    output: z.record(z.string(), pendingSchema.nullable()),
  },
  activity: {
    input: z.object({ keys: z.array(z.string().min(1)).min(1).max(50) }),
    output: z.record(z.string(), threadActivitySchema.nullable()),
    keyTags: (key: string) => [`activity:${key}`],
  },
  setOrchestrationView: {
    input: z.object({ on: z.boolean() }),
    output: z.object({ on: z.boolean() }),
  },
};
