import { test } from "node:test";
import assert from "node:assert/strict";
import { createActivityReader, createRefreshScheduler, emptyActivityFold, foldActivityEvents, toThreadActivity, type ActivityEventRow, type ActivityListArgs } from "../src/activity.ts";

let seq = 0;
const row = (type: string, createdAt: number, data: unknown = {}, scope?: unknown): ActivityEventRow => ({ seq: ++seq, type, createdAt, data, scope });
const command = (id: string, cmd: string) => ({ item: { id, type: "commandExecution", command: cmd } });
const fold = (rows: ActivityEventRow[]) => toThreadActivity(foldActivityEvents(emptyActivityFold(), rows));

test("an open item gives the step and its start; its completion clears it", () => {
  const open = fold([row("turn/started", 100, {}, { turnId: "t1" }), row("item/started", 150, command("a", "npm test -- --watch"))]);
  assert.equal(open.turnStartedAt, 100);
  assert.equal(open.step, "Running npm test --");
  assert.equal(open.stepStartedAt, 150);
  const closed = fold([row("turn/started", 100, {}, { turnId: "t1" }), row("item/started", 150, command("a", "npm test")), row("item/completed", 190, { item: { id: "a" } })]);
  assert.equal(closed.step, null);
  assert.equal(closed.turnStartedAt, 100);
});

test("turn/completed clears open steps and the running turn, and keeps lastTurnStartedAt", () => {
  const done = fold([row("turn/started", 100, {}, { turnId: "t1" }), row("item/started", 150, command("a", "make")), row("turn/completed", 300, { status: "completed" }, { turnId: "t1" })]);
  assert.equal(done.step, null);
  assert.equal(done.turnStartedAt, null);
  assert.equal(done.lastTurnStartedAt, 100);
});

test("a nested turn's completion does not end the outer turn", () => {
  const running = fold([
    row("turn/started", 100, {}, { turnId: "outer" }),
    row("turn/started", 120, { parentToolCallId: "call" }, { turnId: "inner" }),
    row("item/started", 130, command("a", "make")),
    row("turn/completed", 140, { status: "completed" }, { turnId: "inner" }),
  ]);
  assert.equal(running.turnStartedAt, 100);
  assert.equal(running.lastTurnStartedAt, 100);
  assert.equal(running.step, "Running make");
});

test("a background task with progress and no completion is listed; its completion removes it", () => {
  const task = { item: { id: "bg1", taskType: "local_bash", description: "Wait for re-run build result" } };
  const listed = fold([row("item/backgroundTask/progress", 100, task)]);
  assert.deepEqual(listed.background, [{ description: "Wait for re-run build result", startedAt: 100 }]);
  assert.deepEqual(fold([row("item/backgroundTask/progress", 100, task), row("item/backgroundTask/completed", 200, task)]).background, []);
});

test("a second read asks only for events after the last seq", async () => {
  const calls: ActivityListArgs[] = [];
  const rows = [row("turn/started", 100, {}, { turnId: "t1" })];
  const reader = createActivityReader({ listEvents: async (args) => { calls.push(args); return args.order === "asc" && args.afterSeq === String(rows[0]!.seq) ? [] : rows; }, log: () => {} });
  const first = await reader.read("thr_a");
  assert.equal(first.turnStartedAt, 100);
  assert.equal(calls[0]!.order, "desc");
  await reader.read("thr_a");
  const second = calls.at(-1)!;
  assert.equal(second.order, "asc");
  assert.equal(second.afterSeq, String(rows[0]!.seq));
  assert.ok(second.types.includes("item/started"), "the read is filtered by type");
});

test("a failing read rejects, logs once per streak and recovers", async () => {
  let fail = true;
  const logs: string[] = [];
  const reader = createActivityReader({ listEvents: async () => { if (fail) throw new Error("boom"); return []; }, log: (m) => logs.push(m) });
  await assert.rejects(reader.read("thr_a"));
  await assert.rejects(reader.read("thr_a"));
  assert.equal(logs.length, 1);
  fail = false;
  assert.equal((await reader.read("thr_a")).turnStartedAt, null);
});

test("an event for a thread with a fold invalidates activity:<id> once; another thread does nothing", async () => {
  const tags: string[][] = [];
  const schedule = createRefreshScheduler({ has: (id) => id === "thr_a", invalidate: (t) => tags.push(t), ms: 5 });
  schedule("thr_a");
  schedule("thr_a");
  schedule("thr_b");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(tags, [["activity:thr_a"]]);
});
