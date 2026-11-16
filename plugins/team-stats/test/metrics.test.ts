import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, foldRuns, type EventRow } from "../lib/metrics.ts";
const thread = { id: "t", projectId: "p", providerId: "claude-code" };
const row = (seq: number, type: string, item: unknown): EventRow => ({
  seq,
  type,
  createdAt: seq * 1000,
  data: { item },
});
const delegation = {
  type: "delegation",
  id: "d",
  label: "Review",
  background: true,
  status: "completed",
  presentation: { detail: "team-reviewer agent · model opus" },
};
test("launch completion is unknown until the background task reports; cumulative usage is not summed", () => {
  const start = row(1, "item/started", delegation),
    launch = row(2, "item/completed", delegation);
  assert.equal(foldRuns([start, launch], thread)[0].state, "unknown");
  const task = {
    type: "backgroundTask",
    id: "b",
    taskType: "local_agent",
    parentToolCallId: "d",
    taskStatus: "running",
    usage: { totalTokens: 100, toolUses: 2, durationMs: 2000 },
  };
  const runs = foldRuns(
    [
      start,
      launch,
      row(3, "item/backgroundTask/progress", task),
      row(4, "item/backgroundTask/completed", {
        ...task,
        parentToolCallId: undefined,
        taskStatus: "completed",
        usage: { totalTokens: 150, toolUses: 3, durationMs: 3000 },
      }),
      row(5, "item/delegation/completed", delegation),
    ],
    thread,
  );
  assert.equal(runs.length, 1);
  assert.equal(runs[0].tokens, 150);
  assert.equal(runs[0].state, "completed");
  assert.equal(runs[0].endedAt, 4000);
  assert.equal(runs[0].member, "team-reviewer");
  assert.equal(runs[0].model, "opus");
  assert.equal(runs[0].durationMs, 3000);
});
test("failed delegations and missing starts are not fabricated", () => {
  const [run] = foldRuns(
    [
      row(1, "item/delegation/completed", {
        ...delegation,
        background: false,
        status: "failed",
      }),
    ],
    thread,
  );
  assert.equal(run.state, "failed");
  assert.equal(run.startedAt, null);
  assert.equal(run.durationMs, null);
  assert.equal(run.tokens, null);
});
test("workflow snapshots deduplicate calls and exclude cached replays", () => {
  const agent = {
    index: 0,
    attempt: 1,
    cached: false,
    agentType: "team-implementer",
    model: "sol",
    label: "Build",
    state: "done",
    startedAt: 1000,
    durationMs: 2000,
    tokens: 20,
    toolCalls: 2,
  };
  const item = {
    type: "backgroundTask",
    id: "w",
    workflow: {
      agents: [agent, { ...agent, index: 1, cached: true, tokens: 500 }],
    },
  };
  const runs = foldRuns(
    [
      row(1, "item/backgroundTask/progress", item),
      row(2, "item/backgroundTask/completed", item),
    ],
    thread,
  );
  assert.equal(runs.length, 1);
  assert.equal(runs[0].tokens, 20);
  assert.equal(runs[0].state, "completed");
});
test("averages use known samples including zero and completed timings only", () => {
  const base = foldRuns(
    [
      row(1, "item/started", { ...delegation, background: false }),
      row(2, "item/completed", { ...delegation, background: false }),
    ],
    thread,
  )[0];
  const values = [
    { ...base, tokens: 100, durationMs: 1000 },
    { ...base, tokens: null, durationMs: 3000 },
    { ...base, tokens: 0, durationMs: null },
    { ...base, tokens: null, state: "running", durationMs: 99999 },
  ];
  const [group] = aggregate(values);
  assert.equal(group.avgTokens, 50);
  assert.equal(group.tokenSamples, 2);
  assert.equal(group.avgMs, 2000);
  assert.equal(group.p95Ms, 3000);
  assert.equal(group.timedSamples, 2);
  assert.equal(group.running, 1);
  assert.equal(aggregate([{ ...base, tokens: null }])[0].tokens, null);
  assert.equal(aggregate([base, { ...base, model: "other" }]).length, 2);
});
test("malformed telemetry and shell tasks do not contribute", () => {
  assert.deepEqual(
    foldRuns(
      [
        row(1, "item/completed", null),
        row(2, "item/completed", {
          type: "backgroundTask",
          id: "shell",
          taskType: "local_bash",
        }),
      ],
      thread,
    ),
    [],
  );
  const runs = foldRuns(
    [
      row(1, "item/started", delegation),
      row(2, "item/backgroundTask/completed", {
        type: "backgroundTask",
        id: "b",
        taskType: "local_agent",
        parentToolCallId: "d",
        taskStatus: "failed",
        usage: { totalTokens: -10, toolUses: NaN },
      }),
    ],
    thread,
  );
  assert.equal(runs[0].tokens, null);
  assert.equal(runs[0].tools, null);
});
