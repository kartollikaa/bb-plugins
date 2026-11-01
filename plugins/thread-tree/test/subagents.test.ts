import { test } from "node:test";
import assert from "node:assert/strict";
import { agentTypeFrom, createSubagentFolder, PAGE_SIZE, type EventRow, type ListEventsArgs } from "../src/subagents.ts";

let seq = 0;
const row = (type: string, item: Record<string, unknown>, createdAt = ++seq * 1000): EventRow => ({
  seq: ++seq,
  type,
  createdAt,
  data: { providerThreadId: "p", item },
});

const delegation = (id: string, extra: Record<string, unknown> = {}) => ({
  type: "delegation",
  id,
  childRef: `toolu_${id}`,
  label: `Task ${id}`,
  status: "pending",
  background: false,
  presentation: { title: `Task ${id}`, detail: "web-fetch agent" },
  ...extra,
});

function folderOver(rows: EventRow[], pageSize?: number) {
  const calls: ListEventsArgs[] = [];
  const folder = createSubagentFolder({
    listEvents: async (args) => {
      calls.push(args);
      const after = Number(args.afterSeq ?? 0);
      return rows.filter((r) => r.seq > after).slice(0, pageSize ?? Number(args.limit));
    },
    log: () => {},
  });
  return { folder, calls };
}

test("foreground delegation runs, then completes with its type", async () => {
  const rows = [row("item/started", delegation("a"))];
  const { folder } = folderOver(rows);
  let read = await folder.read("t");
  assert.equal(read.total, 1);
  assert.deepEqual(
    { state: read.subagents[0]!.state, agentType: read.subagents[0]!.agentType, label: read.subagents[0]!.label },
    { state: "running", agentType: "web-fetch", label: "Task a" },
  );
  rows.push(row("item/completed", delegation("a", { status: "completed" })));
  read = await folder.read("t");
  assert.equal(read.subagents[0]!.state, "completed");
  assert.notEqual(read.subagents[0]!.endedAt, null);
});

test("error and interrupted map to failed and stopped", async () => {
  const rows = [
    row("item/started", delegation("e")),
    row("item/delegation/completed", delegation("e", { status: "error" })),
    row("item/started", delegation("i")),
    row("item/completed", delegation("i", { status: "interrupted" })),
  ];
  const { folder } = folderOver(rows);
  const states = Object.fromEntries((await folder.read("t")).subagents.map((s) => [s.id, s.state]));
  assert.deepEqual(states, { e: "failed", i: "stopped" });
});

test("background delegation follows its task, not the launch", async () => {
  const rows = [
    row("item/started", delegation("b", { background: true })),
    row("item/started", { type: "backgroundTask", id: "task1", taskType: "local_agent", taskStatus: "running", parentToolCallId: "b" }),
    row("item/delegation/completed", delegation("b", { background: true, status: "completed" })),
    row("item/backgroundTask/progress", { type: "backgroundTask", id: "task1", taskType: "local_agent", taskStatus: "running", usage: { totalTokens: 1200, toolUses: 3 }, parentToolCallId: "b" }),
  ];
  const { folder } = folderOver(rows);
  let agent = (await folder.read("t")).subagents[0]!;
  assert.equal(agent.state, "running");
  assert.equal(agent.totalTokens, 1200);
  rows.push(row("item/backgroundTask/completed", { type: "backgroundTask", id: "task1", taskType: "local_agent", taskStatus: "completed" }));
  agent = (await folder.read("t")).subagents[0]!;
  assert.equal(agent.state, "completed");
});

test("the launch result does not end a background agent whose task already runs", async () => {
  const rows = [
    row("item/started", delegation("l", { background: true })),
    row("item/started", { type: "backgroundTask", id: "task3", taskType: "local_agent", taskStatus: "running", parentToolCallId: "l" }),
    row("item/delegation/completed", delegation("l", { background: true, status: "completed" })),
  ];
  const { folder } = folderOver(rows);
  assert.equal((await folder.read("t")).subagents[0]!.state, "running");
});

test("a background launch with no task yet reads completed until a task revives it", async () => {
  const rows = [
    row("item/started", delegation("c", { background: true })),
    row("item/delegation/completed", delegation("c", { background: true, status: "completed" })),
  ];
  const { folder } = folderOver(rows);
  assert.equal((await folder.read("t")).subagents[0]!.state, "completed");
  rows.push(row("item/backgroundTask/progress", { type: "backgroundTask", id: "task2", taskType: "local_agent", taskStatus: "running", parentToolCallId: "c" }));
  assert.equal((await folder.read("t")).subagents[0]!.state, "running");
});

test("a failed read rejects instead of reporting no subagents, then recovers", async () => {
  let fail = true;
  const folder = createSubagentFolder({
    listEvents: async () => {
      if (fail) throw new Error("HTTP 400");
      return [row("item/started", delegation("r"))];
    },
    log: () => {},
  });
  await assert.rejects(folder.read("t"), /HTTP 400/);
  fail = false;
  assert.equal((await folder.read("t")).total, 1);
});

test("non-agent background tasks and other items are ignored", async () => {
  const rows = [
    row("item/started", { type: "commandExecution", id: "x" }),
    row("item/started", { type: "backgroundTask", id: "bash", taskType: "local_bash", taskStatus: "running", parentToolCallId: "x" }),
    row("item/started", { nonsense: true }),
  ];
  const { folder } = folderOver(rows);
  assert.equal((await folder.read("t")).total, 0);
});

test("pages through history and only reads new events afterwards", async () => {
  const rows = Array.from({ length: PAGE_SIZE * 2 + 3 }, (_, i) => row("item/started", delegation(`d${i}`)));
  const { folder, calls } = folderOver(rows);
  const read = await folder.read("t");
  assert.equal(read.total, rows.length);
  assert.equal(read.subagents.length, 40);
  assert.equal(read.subagents[0]!.id, `d${rows.length - 1}`);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => Number(call.limit) <= 100));
  calls.length = 0;
  await folder.read("t");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.afterSeq, String(rows.at(-1)!.seq));
});

test("agent type drops the model suffix and the word agent", () => {
  assert.equal(agentTypeFrom("general-purpose agent · model opus"), "general-purpose");
  assert.equal(agentTypeFrom("web-fetch agent"), "web-fetch");
  assert.equal(agentTypeFrom(null), null);
});
