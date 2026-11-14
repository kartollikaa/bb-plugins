import { test } from "node:test";
import assert from "node:assert/strict";
import type { Agent, LedgerSummary, Subtask } from "../src/contract.ts";
import { buildView, firstLine, longAge, prettyModel, shortAge, type LiveThread } from "../src/view.ts";

const NOW = Date.UTC(2026, 10, 14, 12, 0);
const MIN = 60_000;

function subtask(id: string, status: string, extra: Partial<Subtask> = {}): Subtask {
  return {
    id, name: `${id} name`, threadId: `thr_${id.toLowerCase()}`, status, statusRaw: status, modelRaw: null,
    dependsOn: [], gateLine: null, gateFailures: 0, lastFailedKind: null, rotations: 0, ...extra,
  };
}
function ledger(subtasks: Subtask[], extra: Partial<LedgerSummary> = {}): LedgerSummary {
  return { path: "/l.md", goal: "Goal", status: "active", subtasks, forTheOwner: [], orchestratorSessions: 1, lastHandover: null, warnings: [], ...extra };
}
function live(minutesAgo: number, extra: Partial<LiveThread> = {}): LiveThread {
  return { status: "idle", hasPendingInteraction: false, latestAttentionAt: NOW - minutesAgo * MIN, createdAt: NOW - 600 * MIN, ...extra };
}
function agent(extra: Partial<Agent> = {}): Agent {
  return { model: "claude-opus-5-5", effort: "medium", contextUsed: 150_000, contextWindow: 300_000, lastOutput: null, lastReportAt: null, ...extra };
}
const view = (subtasks: Subtask[], lives: Record<string, LiveThread>, agents: Record<string, Agent> = {}, extra: Partial<LedgerSummary> = {}) =>
  buildView({ ledger: ledger(subtasks, extra), agents, live: lives, orchestratorThreadId: "thr_orch", now: NOW });

test("no subtasks: planning", () => {
  const v = view([], {});
  assert.equal(v.state, "planning");
  assert.equal(v.heading, "Planning the work");
});

test("all moving: nothing needs you, with progress and the freshest report", () => {
  const v = view(
    [subtask("S1", "landed"), subtask("S2", "working"), subtask("S3", "waiting-dependency", { dependsOn: ["S1", "S2"] })],
    { thr_s2: live(3), thr_s1: live(100) },
  );
  assert.equal(v.state, "moving");
  assert.equal(v.heading, "Nothing needs you");
  assert.equal(v.subline, "1 agent working · 1 of 3 done · latest report 3m ago");
  assert.deepEqual(v.active.map((r) => [r.id, r.kind]), [["S2", "work"], ["S3", "wait"]]);
  assert.equal(v.active[1]!.step, "Starts after S2", "a landed dependency no longer blocks");
  assert.equal(v.active[1]!.age, "");
  assert.equal(v.done.length, 1);
  assert.equal(v.teamLabel, "Team");
});

test("a question is the one card; asked agents leave the list", () => {
  const v = view(
    [subtask("S4", "question"), subtask("S5", "working")],
    { thr_s4: live(12), thr_s5: live(2) },
    { thr_s4: agent({ lastOutput: "Should archived sessions count toward the badge?" }) },
  );
  assert.equal(v.state, "needs");
  assert.equal(v.heading, "One question for you");
  assert.equal(v.subline, "The rest of the team is moving · 0 of 2 done");
  assert.equal(v.asks[0]!.text, "Should archived sessions count toward the badge?");
  assert.equal(v.asks[0]!.age, "12m");
  assert.equal(v.asks[0]!.drafts!.primary, "Re S4: ");
  assert.deepEqual(v.active.map((r) => r.id), ["S5"]);
  assert.equal(v.teamLabel, "Rest of the team");
});

test("ready is a decision; several asks sort oldest first", () => {
  const v = view(
    [subtask("S4", "question"), subtask("S7", "ready")],
    { thr_s4: live(5), thr_s7: live(185) },
  );
  assert.equal(v.heading, "2 things need you");
  assert.equal(v.asks[0]!.key, "S7");
  assert.equal(v.asks[0]!.kind, "decision");
  assert.equal(v.asks[0]!.age, "3h 5m");
  assert.equal(v.asks[0]!.drafts!.secondary, "S7: not yet, hold the landing.");
  assert.equal(view([subtask("S7", "ready")], {}).heading, "One decision for you");
});

test("a pending approval in a child's thread needs you, without a composer draft", () => {
  const v = view([subtask("S2", "working")], { thr_s2: live(1, { hasPendingInteraction: true }) });
  assert.equal(v.state, "needs");
  assert.equal(v.asks[0]!.kind, "thread");
  assert.equal(v.asks[0]!.drafts, null);
});

test("the orchestrator's own pending question needs you too", () => {
  const v = view([subtask("S2", "working")], { thr_s2: live(1), thr_orch: live(4, { hasPendingInteraction: true }) });
  assert.equal(v.asks[0]!.who, "Orchestrator");
});

test("each «For the owner» line needs you, after the timed asks", () => {
  const v = view([subtask("S7", "ready"), subtask("S2", "working")], { thr_s7: live(5), thr_s2: live(1) }, {},
    { forTheOwner: ["Waiting: owner merge of hub#38"] });
  assert.equal(v.heading, "2 things need you");
  assert.deepEqual(v.asks.map((a) => a.key), ["S7", "owner-0"]);
  assert.equal(v.asks[1]!.drafts!.primary, "Re «Waiting: owner merge of hub#38»: ");
  const only = view([subtask("S2", "working")], { thr_s2: live(1) }, {}, { forTheOwner: ["Confirm the window"] });
  assert.equal(only.heading, "One thing waits on you");
  assert.equal(only.state, "needs");
});

test("quiet for 30 min while working is stuck; 29 min is not", () => {
  const quiet = view([subtask("S5", "working"), subtask("S6", "working")], { thr_s5: live(52), thr_s6: live(4) },
    { thr_s5: agent({ lastOutput: "## Writing tests for the fold threshold\nmore" }) });
  assert.equal(quiet.state, "stuck");
  assert.equal(quiet.heading, "Nothing needs you, but S5 has gone quiet");
  assert.equal(quiet.subline, "No report from S5 for 52 min. Everyone else reported in the last 4 min.");
  assert.equal(quiet.active[0]!.id, "S5");
  assert.equal(quiet.active[0]!.step, "Quiet for 52 min · last: Writing tests for the fold threshold");
  assert.equal(quiet.nudge!.draft, "What is S5 doing? It hasn't reported for 52 min.");
  assert.equal(view([subtask("S5", "working")], { thr_s5: live(29) }).state, "moving");
  const edge = buildView({ ledger: ledger([subtask("S5", "working")]), agents: {}, orchestratorThreadId: "x", now: NOW,
    live: { thr_s5: { ...live(0), latestAttentionAt: NOW - 30 * MIN } } });
  assert.equal(edge.state, "stuck");
});

test("a quiet subtask in the gate is waiting on the orchestrator, not stuck", () => {
  assert.equal(view([subtask("S5", "gate")], { thr_s5: live(90) }).state, "moving");
});

test("a third failure is going in circles; a second is not", () => {
  const v = view([subtask("S6", "gate", { gateFailures: 3, lastFailedKind: "review" })], { thr_s6: live(1) });
  assert.equal(v.heading, "Nothing needs you, but S6 is going in circles");
  assert.equal(v.subline, "Review failed 3 times.");
  assert.equal(v.active[0]!.step, "Review failed 3 times");
  assert.equal(view([subtask("S6", "gate", { gateFailures: 2 })], { thr_s6: live(1) }).state, "moving");
});

test("everything landed, or a closed ledger: done", () => {
  const v = view([subtask("S1", "verified"), subtask("S2", "dropped")], {});
  assert.equal(v.state, "done");
  assert.equal(v.heading, "All 2 subtasks are done");
  assert.equal(view([subtask("S1", "working")], {}, {}, { status: "closed" }).subline, "The ledger is closed.");
});

test("row detail: model, effort, context and rotations", () => {
  const v = view([subtask("S2", "working", { rotations: 2 })], { thr_s2: live(1) }, { thr_s2: agent() });
  assert.equal(v.active[0]!.runs, "Opus 5.5 · medium");
  assert.equal(v.active[0]!.context, "50% · rotated twice");
  assert.equal(v.active[0]!.gate, "Not at a gate yet");
  const bare = view([subtask("S2", "working", { modelRaw: "inherits: opus", threadId: null })], {});
  assert.equal(bare.active[0]!.runs, "inherits: opus");
  assert.equal(bare.active[0]!.context, "—");
});

test("formatting helpers", () => {
  assert.equal(shortAge(20_000), "now");
  assert.equal(shortAge(61 * MIN), "1h 1m");
  assert.equal(shortAge(120 * MIN), "2h");
  assert.equal(shortAge(50 * 60 * MIN), "2d");
  assert.equal(longAge(125 * MIN), "2 h 5 min");
  assert.equal(prettyModel("claude-sonnet-5-5-20261101"), "Sonnet 5.5");
  assert.equal(prettyModel("gpt-6"), "gpt-6");
  assert.equal(firstLine("\n\n**Done:** [PR](https://x) merged"), "Done: PR merged");
  assert.equal(firstLine("x".repeat(200), 10), "xxxxxxxxx…");
  assert.equal(firstLine("_RO1_ says REQUEST_CHANGES on __S6__"), "RO1 says REQUEST_CHANGES on S6");
});
