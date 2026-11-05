import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findRunningTask,
  foldRunningTasks,
  isSafeId,
  outputFileName,
  stopRequestSchema,
  stopMessage,
  type EventRow,
} from "../lib/tasks.ts";

const started = (seq: number, id: string, taskId: string, description: string, taskType = "local_bash"): EventRow => ({
  seq,
  type: "item/started",
  createdAt: seq,
  data: {
    providerThreadId: "sess-1",
    item: { type: "backgroundTask", id, familyId: taskId, taskType, description, status: "pending", taskStatus: "running" },
  },
});

const completed = (seq: number, id: string, taskStatus: string | null): EventRow => ({
  seq,
  type: "item/backgroundTask/completed",
  createdAt: seq,
  data: { item: { type: "backgroundTask", id, status: "completed", ...(taskStatus ? { taskStatus } : {}) } },
});

test("a started task is running until a completion closes it", () => {
  const rows = [started(1, "i1", "b1", "Wait for tests"), started(2, "i2", "b2", "Dev server"), completed(3, "i1", "completed")];
  const tasks = foldRunningTasks(rows);
  assert.deepEqual(
    tasks.map((task) => task.taskId),
    ["b2"],
  );
  assert.equal(tasks[0]?.sessionId, "sess-1");
  assert.equal(tasks[0]?.kind, "command");
});

test("a completion without a task status still closes the task", () => {
  const rows = [started(1, "i1", "b1", "x"), { ...completed(2, "i1", null), type: "item/completed" }];
  assert.equal(foldRunningTasks(rows).length, 0);
});

test("a progress event keeps the task running and keeps its first fields", () => {
  const progress: EventRow = {
    seq: 2,
    type: "item/backgroundTask/progress",
    createdAt: 2,
    data: { item: { type: "backgroundTask", id: "i1", taskStatus: "running" } },
  };
  const [task] = foldRunningTasks([started(1, "i1", "a7", "Research", "local_agent"), progress]);
  assert.equal(task?.kind, "agent");
  assert.equal(task?.description, "Research");
  assert.equal(task?.taskId, "a7");
});

test("other items and malformed rows are ignored", () => {
  const rows: EventRow[] = [
    { seq: 1, type: "item/started", createdAt: 1, data: { item: { type: "commandExecution", id: "c1" } } },
    { seq: 2, type: "item/started", createdAt: 2, data: null },
    { seq: 3, type: "item/started", createdAt: 3, data: { item: { type: "backgroundTask", id: "i9" } } },
  ];
  assert.deepEqual(foldRunningTasks(rows), []);
});

test("workflows are not stoppable tasks", () => {
  assert.deepEqual(foldRunningTasks([started(1, "i1", "w1", "Review", "local_workflow")]), []);
});

test("the nth task with the same description is picked in start order", () => {
  const tasks = foldRunningTasks([started(1, "i1", "b1", "Same"), started(2, "i2", "b2", "Other"), started(3, "i3", "b3", "Same")]);
  assert.equal(findRunningTask(tasks, "Same", 0)?.taskId, "b1");
  assert.equal(findRunningTask(tasks, "Same", 1)?.taskId, "b3");
  assert.equal(findRunningTask(tasks, "Same", 2), null);
  assert.equal(findRunningTask(tasks, "Missing", 0), null);
});

test("ids that could escape a path are refused", () => {
  assert.equal(isSafeId("bfzrxlk80"), true);
  assert.equal(isSafeId("e04f70de-685d-4527-8549-56389d595706"), true);
  assert.equal(isSafeId("../etc"), false);
  assert.equal(isSafeId("a/b"), false);
  assert.equal(isSafeId(""), false);
  assert.equal(outputFileName("b1"), "b1.output");
});

test("the stop message names the task id and asks for nothing else", () => {
  const text = stopMessage({ itemId: "i1", taskId: "a7", kind: "agent", description: "Research", sessionId: null });
  assert.match(text, /TaskStop/);
  assert.match(text, /a7/);
  assert.match(text, /Research/);
});

test("a stop request needs a thread id, a description and a non-negative index", () => {
  assert.equal(stopRequestSchema.safeParse({ threadId: "thr_1", description: "x", index: 0 }).success, true);
  assert.equal(stopRequestSchema.safeParse({ threadId: "", description: "x", index: 0 }).success, false);
  assert.equal(stopRequestSchema.safeParse({ threadId: "thr_1", description: "x", index: -1 }).success, false);
  assert.equal(stopRequestSchema.safeParse({ threadId: "thr_1", index: 0 }).success, false);
});
