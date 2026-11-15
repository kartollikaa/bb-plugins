import { z } from "zod";

export const subtaskSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
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
  subtasks: z.array(subtaskSchema),
  forTheOwner: z.array(z.string()),
  orchestratorSessions: z.number().int(),
  lastHandover: z.object({ why: z.string().nullable(), at: z.string().nullable() }).nullable(),
  warnings: z.array(z.string()),
  /** «Current checkpoint» and the newest «Decision journal» row: what the recap says is happening now. */
  checkpoint: z.object({ text: z.string(), at: z.string().nullable() }).nullable(),
  lastDecision: z.object({ text: z.string(), at: z.string().nullable() }).nullable(),
  workflow: z.array(z.object({
    kind: z.enum(["decision", "gate", "handover"]),
    task: z.string().nullable(),
    title: z.string(),
    detail: z.string().nullable(),
    at: z.string().nullable(),
  })).optional(),
});
export type LedgerSummary = z.infer<typeof ledgerSummarySchema>;

export const agentSchema = z.object({
  model: z.string().nullable(),
  effort: z.string().nullable(),
  contextUsed: z.number().nullable(),
  contextWindow: z.number().nullable(),
  /** The agent's last assistant text, trimmed. */
  lastOutput: z.string().nullable(),
  /** When the agent last finished a turn (bb's latestAttentionAt), epoch ms. */
  lastReportAt: z.number().nullable(),
});
export type Agent = z.infer<typeof agentSchema>;

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
    input: z.object({ threadId: z.string().min(1).max(100), text: z.string().min(1).max(2_000) }),
    output: z.object({ delivery: z.enum(["sent", "queued", "already"]) }),
  },
  setOrchestrationView: {
    input: z.object({ on: z.boolean() }),
    output: z.object({ on: z.boolean() }),
  },
};
