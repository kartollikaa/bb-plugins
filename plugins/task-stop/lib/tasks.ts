import { z } from "zod";

export const TASK_EVENT_TYPES = [
  "item/started",
  "item/completed",
  "item/backgroundTask/progress",
  "item/backgroundTask/completed",
] as const;

export interface EventRow {
  seq: number;
  type: string;
  createdAt: number;
  data: unknown;
}

export type TaskKind = "command" | "agent";

export interface RunningTask {
  itemId: string;
  /** The provider's own task id, the one its stop tool takes. */
  taskId: string;
  kind: TaskKind;
  description: string;
  /** The provider session, which names the folder holding the task's output file. */
  sessionId: string | null;
}

export const stopRequestSchema = z.object({
  threadId: z.string().trim().min(1).max(200),
  description: z.string().max(4000),
  index: z.number().int().min(0).max(1000),
});
export type StopRequest = z.infer<typeof stopRequestSchema>;

const eventDataSchema = z.object({
  providerThreadId: z.string().nullish(),
  item: z
    .object({
      type: z.literal("backgroundTask"),
      id: z.string(),
      familyId: z.string().nullish(),
      taskType: z.string().nullish(),
      description: z.string().nullish(),
      taskStatus: z.string().nullish(),
    })
    .passthrough(),
});

const LIVE_TASK_STATUSES = new Set(["pending", "running", "paused"]);

function kindOf(taskType: string | null | undefined): TaskKind | null {
  if (taskType === "local_bash") return "command";
  if (taskType === "local_workflow") return null;
  return "agent";
}

/** Background tasks still running after the given events, oldest first. */
export function foldRunningTasks(rows: readonly EventRow[]): RunningTask[] {
  const tasks = new Map<string, RunningTask>();
  for (const row of rows) {
    const parsed = eventDataSchema.safeParse(row.data);
    if (!parsed.success) continue;
    const { item, providerThreadId } = parsed.data;
    const existing = tasks.get(item.id);
    const live = item.taskStatus ? LIVE_TASK_STATUSES.has(item.taskStatus) : row.type === "item/started";
    if (!live) {
      tasks.delete(item.id);
      continue;
    }
    if (existing) continue;
    const kind = kindOf(item.taskType);
    if (kind === null || !item.familyId || row.type !== "item/started") continue;
    tasks.set(item.id, {
      itemId: item.id,
      taskId: item.familyId,
      kind,
      description: item.description ?? "",
      sessionId: providerThreadId ?? null,
    });
  }
  return [...tasks.values()];
}

/** The `index`-th running task whose description matches, counted in start order like bb's card. */
export function findRunningTask(tasks: readonly RunningTask[], description: string, index: number): RunningTask | null {
  return tasks.filter((task) => task.description === description)[index] ?? null;
}

export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id);
}

export function outputFileName(taskId: string): string {
  return `${taskId}.output`;
}

export function stopMessage(task: RunningTask): string {
  return [
    `Stop the background ${task.kind} "${task.description}" now: call TaskStop with task_id ${task.taskId}.`,
    "The user pressed its stop button. Do nothing else and reply in one short line.",
  ].join(" ");
}
