import { test } from "node:test";
import assert from "node:assert/strict";
import type { Agent, LedgerSummary, Subtask, ThreadActivity } from "../src/contract.ts";
import { STALE_GRACE_MS, askIdentity, buildView, chatQuestion, childLabel, firstLine, longAge, prettyModel, shortAge, type LiveThread } from "../src/view.ts";

const NOW = Date.UTC(2026, 10, 14, 12, 0);
const MIN = 60_000;

function subtask(id: string, status: string, extra: Partial<Subtask> = {}): Subtask {
  return {
    id, name: `${id} name`, threadId: `thr_${id.toLowerCase()}`, status, statusRaw: status, modelRaw: null,
    dependsOn: [], gateLine: null, gateFailures: 0, lastFailedKind: null, rotations: 0, ...extra,
  };
}
function ledger(subtasks: Subtask[], extra: Partial<LedgerSummary> = {}): LedgerSummary {
  return { path: "/l.md", goal: "Goal", status: "active", subtasks, forTheOwner: [], orchestratorSessions: 1, lastHandover: null, warnings: [], checkpoint: null, lastDecision: null, ...extra };
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
  assert.equal(v.sections.status.word, "Planning");
  assert.equal(v.sections.status.sentence, "The orchestrator is splitting the goal into parts");
});

test("all moving: nothing needs you, with progress and the freshest report", () => {
  const v = view(
    [subtask("S1", "landed"), subtask("S2", "working"), subtask("S3", "waiting-dependency", { dependsOn: ["S1", "S2"] })],
    { thr_s2: live(3), thr_s1: live(100) },
  );
  assert.equal(v.state, "moving");
  assert.equal(v.sections.status.word, "Waiting");
  assert.equal(v.sections.status.sentence, "Waiting for «S2 name»");
  assert.equal(v.sections.status.progress, "1 of 3 parts done");
  assert.equal(v.rowLabel, "Waiting · Waiting for «S2 name»");
  assert.deepEqual(v.active.map((r) => [r.id, r.kind]), [["S2", "work"], ["S3", "wait"]]);
  assert.equal(v.active[1]!.step, "Starts after S2", "a landed dependency no longer blocks");
  assert.equal(v.active[1]!.age, "");
  assert.equal(v.done.length, 1);
});

test("a question is the one card; asked agents leave the list", () => {
  const v = view(
    [subtask("S4", "question"), subtask("S5", "working")],
    { thr_s4: live(12), thr_s5: live(2) },
    { thr_s4: agent({ lastOutput: "Should archived sessions count toward the badge?" }) },
  );
  assert.equal(v.state, "needs");
  assert.equal(v.sections.status.word, "Needs you");
  assert.equal(v.sections.status.sentence, "1 question");
  assert.equal(v.sections.status.nothingNeedsYou, false);
  assert.equal(v.asks[0]!.text, "Should archived sessions count toward the badge?");
  assert.equal(v.asks[0]!.age, "12m");
  assert.equal(v.asks[0]!.drafts!.primary, "Re S4: ");
  assert.deepEqual(v.active.map((r) => r.id), ["S5"]);
});

test("ready is a decision; several asks sort oldest first", () => {
  const v = view(
    [subtask("S4", "question"), subtask("S7", "ready")],
    { thr_s4: live(5), thr_s7: live(185) },
  );
  assert.equal(v.sections.status.sentence, "1 decision and 1 question");
  assert.equal(v.asks[0]!.key, "S7");
  assert.equal(v.asks[0]!.kind, "decision");
  assert.equal(v.asks[0]!.age, "3h 5m");
  assert.equal(v.asks[0]!.drafts!.secondary, "S7: not yet, hold the landing.");
  assert.equal(view([subtask("S7", "ready")], {}).sections.status.sentence, "1 decision");
});

test("a ready card says what lands: the ledger's note, delivery, version and gate", () => {
  const ready = subtask("S7", "ready", {
    statusRaw: "ready — review passed; merge after the freeze", delivery: "PR #41", version: "9f3e2a1", gateLine: "checks passed · review passed",
  });
  const v = view([ready], { thr_s7: live(5) });
  const ask = v.asks[0]!;
  assert.equal(ask.title, "Review passed; merge after the freeze");
  assert.equal(ask.text, "- **Lands:** PR #41\n- **Version:** `9f3e2a1`\n- **Gate:** checks passed · review passed");
  assert.equal(ask.drafts!.primary, "S7 at 9f3e2a1: go ahead and land it.");
  const bare = view([subtask("S7", "ready")], {}).asks[0]!;
  assert.equal(bare.title, "S7 name passed its checks and waits for your word to land");
  assert.match(bare.text, /names no branch, version or gate/);
});

test("a «For the owner» line on a ready subtask's thread replaces its landing card", () => {
  const plan = subtask("T1", "ready", { statusRaw: "ready — plan verified; waits on owner's answers and folder review", threadId: "thr_t1", name: "branch plan (no PR)" });
  const v = view([plan], { thr_t1: live(8) }, {}, { forTheOwner: ["ask: Answer the 6 plan questions | thread: thr_t1 | options: All as recommended / One by one"] });
  assert.equal(v.sections.status.sentence, "1 decision");
  assert.deepEqual(v.asks.map((a) => [a.kind, a.who, a.subtask]), [["owner", "branch plan (no PR)", "T1"]]);
  assert.deepEqual(v.asks[0]!.threads, ["thr_t1"]);
  assert.equal(view([subtask("T2", "delivered")], {}).phase.label, "Waiting for verification or landing");
  const named = view([plan], {}, {}, { forTheOwner: ["ask: T1: Review the plan folder"] });
  assert.deepEqual(named.asks.map((a) => a.kind), ["owner"]);
  const other = view([plan, subtask("T2", "working")], {}, {}, { forTheOwner: ["ask: T2: Pick a name"] });
  assert.deepEqual(other.asks.map((a) => a.kind).sort(), ["decision", "owner"]);
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

test("each «For the owner» ask needs you, after the timed asks", () => {
  const v = view([subtask("S7", "ready"), subtask("S2", "working")], { thr_s7: live(5), thr_s2: live(1) }, {},
    { forTheOwner: ["ask: Merge hub#38"] });
  assert.equal(v.sections.status.sentence, "1 decision and 1 question");
  assert.deepEqual(v.asks.map((a) => a.key), ["S7", "owner-0"]);
  assert.equal(v.asks[1]!.drafts!.primary, "Re «Merge hub#38»: ");
  const only = view([subtask("S2", "working")], { thr_s2: live(1) }, {}, { forTheOwner: ["ask: Confirm the window"] });
  assert.equal(only.sections.status.word, "Needs you");
  assert.equal(only.state, "needs");
});

test("an open ask doesn't hide a stuck agent: the subline and the context row name it", () => {
  const v = view([subtask("S5", "working"), subtask("S6", "working"), subtask("S1", "landed")], { thr_s5: live(52), thr_s6: live(2) }, {},
    { forTheOwner: ["ask: Merge hub#38"] });
  assert.equal(v.state, "needs");
  assert.equal(v.sections.status.word, "Needs you");
  assert.equal(v.rowLabel, "Needs you · 1 question");
  assert.equal(v.nudge!.label, "Ask the orchestrator about «S5 name»");
  assert.equal(v.nudge!.text, "S5 name has been quiet for 52 min");
  assert.equal(v.nudge!.draft, "What is S5 («S5 name») doing? It hasn't reported for 52 min.");
  const calm = view([subtask("S6", "working")], { thr_s6: live(2) }, {}, { forTheOwner: ["ask: x"] });
  assert.equal(calm.rowLabel, "Needs you · 1 question");
  assert.equal(calm.nudge, null);
});

test("a new ask under the same key has a new identity, so a «sent» marker doesn't carry over", () => {
  const first = view([subtask("S4", "question")], { thr_s4: live(5) }, { thr_s4: agent({ lastOutput: "Which badge?" }) }).asks[0]!;
  const again = view([subtask("S4", "question")], { thr_s4: live(5) }, { thr_s4: agent({ lastOutput: "Which badge?" }) }).asks[0]!;
  const next = view([subtask("S4", "question")], { thr_s4: live(1) }, { thr_s4: agent({ lastOutput: "And the color?" }) }).asks[0]!;
  const ready = view([subtask("S4", "ready")], { thr_s4: live(5) }).asks[0]!;
  assert.equal(askIdentity(first), askIdentity(again));
  assert.notEqual(askIdentity(first), askIdentity(next));
  assert.notEqual(askIdentity(first), askIdentity(ready));
  const owner = (lines: string[]) => view([], {}, {}, { forTheOwner: lines }).asks[0]!;
  assert.notEqual(askIdentity(owner(["ask: Merge hub#38"])), askIdentity(owner(["ask: Confirm the window", "ask: Merge hub#38"])));
});

test("quiet for 30 min while working is stuck; 29 min is not", () => {
  const quiet = view([subtask("S5", "working"), subtask("S6", "working")], { thr_s5: live(52), thr_s6: live(4) },
    { thr_s5: agent({ lastOutput: "## Writing tests for the fold threshold\nmore" }) });
  assert.equal(quiet.state, "stuck");
  assert.equal(quiet.sections.status.word, "Stuck");
  assert.equal(quiet.sections.status.sentence, "S5 name has been quiet for 52 min");
  assert.equal(quiet.active[0]!.id, "S5");
  assert.equal(quiet.active[0]!.step, "Quiet for 52 min · last: Writing tests for the fold threshold");
  assert.equal(quiet.nudge!.draft, "What is S5 («S5 name») doing? It hasn't reported for 52 min.");
  assert.equal(quiet.rowLabel, "Stuck · S5 name has been quiet for 52 min");
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
  assert.equal(v.sections.status.word, "Stuck");
  assert.equal(v.sections.status.sentence, "S6 name is going in circles: review failed 3 times");
  assert.equal(v.active[0]!.step, "Review failed 3 times");
  assert.equal(view([subtask("S6", "gate", { gateFailures: 2 })], { thr_s6: live(1) }).state, "moving");
});

test("everything landed, or a closed ledger: done", () => {
  const v = view([subtask("S1", "verified"), subtask("S2", "dropped")], {});
  assert.equal(v.state, "done");
  assert.equal(v.sections.status.word, "Done");
  assert.equal(v.sections.status.sentence, "All 2 parts done");
  const closed = view([subtask("S1", "verified"), subtask("S2", "working")], {}, {}, { status: "closed" });
  assert.equal(closed.sections.status.word, "Closed");
  assert.equal(closed.sections.status.sentence, "The ledger is closed, but 1 of 2 parts are still open");
  assert.equal(view([subtask("S1", "landed")], {}).sections.status.sentence, "The only part is done");
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

test("a structured «For the owner» ask says what is asked, and its options become quick replies", () => {
  const v = view([subtask("S2", "working")], { thr_s2: live(1) }, {}, {
    forTheOwner: ["ask: Merge kartollika-ai-hub#38 | why: S5 passed review | link: kartollikaa/kartollika-ai-hub#38 | thread: thr_s5x | options: Go as you recommend / Not now"],
  });
  const ask = v.asks[0]!;
  assert.equal(v.sections.status.sentence, "1 decision");
  assert.equal(ask.title, "Merge kartollika-ai-hub#38");
  assert.equal(ask.text, "S5 passed review");
  assert.equal(ask.drafts!.primary, "Re «Merge kartollika-ai-hub#38»: ");
  assert.deepEqual(ask.replies, [
    { label: "Go as you recommend", draft: "Re «Merge kartollika-ai-hub#38»: Go as you recommend" },
    { label: "Not now", draft: "Re «Merge kartollika-ai-hub#38»: Not now" },
  ]);
  assert.deepEqual(ask.links, [{ label: "kartollika-ai-hub#38", title: "kartollikaa/kartollika-ai-hub#38", href: "https://github.com/kartollikaa/kartollika-ai-hub/pull/38" }]);
  assert.deepEqual(ask.threads, ["thr_s5x"]);
});

test("notes from «For the owner» stay out of what needs you and show in the history", () => {
  const v = view([subtask("S2", "working")], { thr_s2: live(1) }, {}, {
    forTheOwner: ["Nothing waiting. Store PR get-bb/marketplace#958 waits on a maintainer.", "note: T4 accepted the pager slide"],
  });
  assert.equal(v.asks.length, 0);
  assert.equal(v.sections.status.nothingNeedsYou, true);
  assert.deepEqual(v.history.notes, ["Nothing waiting. Store PR get-bb/marketplace#958 waits on a maintainer.", "T4 accepted the pager slide"]);
});

test("an answered ledger ask stops needing you at once and waits on the orchestrator", () => {
  const line = "ask: Remove orchestration bits from thread-tree? | options: keep both / remove";
  const title = "Remove orchestration bits from thread-tree?";
  const at = (answered: Record<string, { answer: string; at: number }>) =>
    buildView({ ledger: ledger([subtask("S2", "landed")], { forTheOwner: [line] }), agents: {}, live: {}, orchestratorThreadId: "thr_orch", now: NOW, answered });
  const open = at({});
  assert.equal(open.sections.status.word, "Needs you", "positive control: unanswered, it needs you");
  assert.equal(open.asks.length, 1);
  const done = at({ [title]: { answer: "keep both", at: NOW - MIN } });
  assert.deepEqual(done.asks, []);
  assert.equal(done.state, "done");
  assert.deepEqual(done.answered.map((a) => [a.title, a.answered]), [[title, { answer: "keep both", at: NOW - MIN }]]);
  assert.equal(at({ "Another ask": { answer: "x", at: NOW } }).asks.length, 1, "an answer to another title changes nothing");
});

test("an answered record is a note, never a card; a line that states a wait is a card", () => {
  const answered = "answered 2026-11-14: Remove orchestration bits from thread-tree? → «keep both (recommended)»";
  const v = view([subtask("S2", "landed")], {}, {}, { forTheOwner: [answered, "Waiting: owner merge of kartollikaa/bb-plugins#12"] });
  assert.equal(v.asks.length, 1);
  assert.equal(v.asks[0]!.freeText, true);
  assert.deepEqual(v.history.notes, [answered]);
  assert.equal(view([], {}, {}, { forTheOwner: [`ask: ${answered}`] }).asks.length, 1, "positive control: the same text as an ask is a card");
});

test("a blocked subtask is stuck with its cause, and the nudge asks what unblocks it", () => {
  const v = view([subtask("T2", "blocked", { statusRaw: "blocked — no access to the registry" }), subtask("T3", "working")], { thr_t2: live(5), thr_t3: live(2) });
  assert.equal(v.state, "stuck");
  assert.equal(v.sections.status.word, "Stuck");
  assert.equal(v.sections.status.sentence, "T2 name is blocked: no access to the registry");
  assert.equal(v.active[0]!.step, "Blocked: no access to the registry");
  assert.equal(v.nudge!.draft, "What is T2 («T2 name») blocked on, and what would unblock it?");
  assert.equal(view([subtask("T2", "blocked")], {}).active[0]!.step, "Blocked");
});

test("a subtask going in circles outranks a blocked one", () => {
  const v = view([subtask("T2", "blocked"), subtask("T3", "gate", { gateFailures: 3, lastFailedKind: "review" })], {});
  assert.equal(v.sections.status.sentence, "T3 name is going in circles: review failed 3 times");
});

test("an owner line that names a subtask first is that subtask's ask, with its thread", () => {
  const v = view([subtask("T2", "delivered")], {}, {}, { forTheOwner: ["ask: T2: Approve the draft | options: Approve / Rework", "ask: X9: Not a subtask"] });
  const [named, other] = v.asks;
  assert.equal(named!.who, "T2 name");
  assert.equal(named!.subtask, "T2");
  assert.equal(named!.title, "Approve the draft");
  assert.equal(named!.replyTitle, "T2: Approve the draft");
  assert.equal(named!.replies[0]!.draft, "Re «T2: Approve the draft»: Approve");
  assert.deepEqual(named!.threads, ["thr_t2"]);
  assert.equal(other!.who, "From the ledger");
  assert.equal(other!.title, "X9: Not a subtask");
});

test("the recap carries the goal and the latest decision with its age", () => {
  const v = view([subtask("T1", "working")], {}, {}, {
    checkpoint: { text: "G1 waits on review of 9f1c2ab.\nmore", at: new Date(NOW - 40 * MIN).toISOString() },
    lastDecision: { text: "Review by R1", at: null },
  });
  assert.deepEqual(v.recap, { goal: "Goal" });
  assert.deepEqual(v.now.lastDecision, { text: "Review by R1", age: "" });
  assert.equal(view([], {}).now.lastDecision, null);
});

test("a running child thread the ledger doesn't list shows in the team, labelled by its title's id", () => {
  const child = (title: string, extra: Partial<LiveThread> = {}) => live(5, { parentThreadId: "thr_orch", title, status: "active", ...extra });
  const v = view([subtask("S1", "landed"), subtask("S2", "working")], {
    thr_s2: live(3),
    thr_kid: child("orch · S11"),
    thr_free: child("Fix the build"),
    thr_idle: child("orch · R3", { status: "idle" }),
    thr_other: live(1, { parentThreadId: "thr_else", title: "x · S12", status: "active" }),
    thr_hidden: child("orch · H1", { hidden: true }),
  });
  assert.deepEqual(v.active.map((r) => [r.id, r.label, r.name, r.kind, r.running]), [
    ["S2", "S2", "S2 name", "work", false],
    ["thr_kid", "S11", "orch", "work", true],
    ["thr_free", "", "Fix the build", "work", true],
  ]);
  assert.equal(v.active[1]!.step, "Running, not in the ledger yet");
  assert.equal(v.threadIds.thr_kid, "thr_kid");
  assert.equal(v.sections.status.sentence, "orch and 1 more are running");
  assert.equal(v.sections.status.progress, "1 of 4 parts done", "a running child the ledger doesn't name yet is a part");
});

test("a child that names a session-less ledger row becomes that row's thread", () => {
  const v = view([subtask("S11", "briefed", { threadId: null })], { thr_kid: live(2, { parentThreadId: "thr_orch", title: "orch · S11", status: "active" }) });
  assert.deepEqual(v.active.map((r) => [r.id, r.running, r.step]), [["S11", true, "Turn running"]]);
  assert.equal(v.threadIds.S11, "thr_kid");
});

test("a child waiting on approval is an ask; a landed subtask running again is active, not done", () => {
  const v = view([subtask("S1", "landed", { statusRaw: "landed abc; follow-up working" })], {
    thr_s1: live(1, { status: "active" }),
    thr_kid: live(4, { parentThreadId: "thr_orch", title: "orch · R2", hasPendingInteraction: true }),
  });
  assert.deepEqual(v.asks.map((a) => [a.key, a.who, a.kind, a.text]), [["thr_kid", "orch", "thread", "orch waits on an approval or a question in its thread."]]);
  assert.equal(v.threadIds.thr_kid, "thr_kid");
  assert.deepEqual(v.active.map((r) => [r.id, r.kind, r.step]), [["S1", "work", "Running again · landed abc; follow-up working"]]);
  assert.equal(v.state, "needs");
  assert.equal(view([subtask("S1", "landed")], { thr_s1: live(1, { status: "active" }) }).state, "moving", "not «done» while a landed subtask runs");
});

test("child labels: an id after the last « · », else none", () => {
  assert.deepEqual(childLabel("thread-tree-sidebar-v2 · O8"), { label: "O8", rest: "thread-tree-sidebar-v2" });
  assert.equal(childLabel("a · S9a")?.label, "S9a");
  assert.equal(childLabel("S11"), null);
  assert.equal(childLabel("a · review of the thing"), null);
  assert.equal(childLabel("tree · v2"), null);
  assert.equal(childLabel("app · iOS17"), null);
  assert.equal(childLabel(null), null);
});

test("a landed subtask running again that stops on an approval needs you", () => {
  const v = view([subtask("S1", "landed")], { thr_s1: live(1, { status: "active", hasPendingInteraction: true }) });
  assert.equal(v.state, "needs");
  assert.deepEqual(v.asks.map((a) => [a.key, a.kind, a.text]), [["S1", "thread", "S1 name waits on an approval or a question in its thread."]]);
});

test("a child asking while the ledger has no subtasks yet needs you", () => {
  const v = view([], { thr_kid: live(1, { parentThreadId: "thr_orch", title: "orch · S1", hasPendingInteraction: true }) });
  assert.equal(v.state, "needs");
  assert.equal(v.rowLabel, "Needs you · 1 request in a thread");
});

test("children bind the live, newest session and never duplicate a row that has a thread", () => {
  const kid = (minutes: number, extra: Partial<LiveThread>) => live(1, { parentThreadId: "thr_orch", createdAt: NOW - minutes * MIN, ...extra });
  const v = view([subtask("S11", "working", { threadId: null }), subtask("S2", "gate")], {
    thr_old: kid(90, { title: "orch · S11" }),
    thr_new: kid(10, { title: "orch · S11", status: "active" }),
    thr_rev: kid(5, { title: "orch · S2", status: "active" }),
  });
  assert.equal(v.threadIds.S11, "thr_new");
  assert.deepEqual(v.active.map((r) => [r.id, r.label, r.name]), [["S11", "S11", "S11 name"], ["S2", "S2", "S2 name"], ["thr_rev", "", "orch · S2"]]);
});


test("six finished tasks and idle delivered T7 preserve the overall runtime blocker", () => {
  const tasks = Array.from({ length: 6 }, (_, i) => subtask(`T${i + 1}`, "landed"));
  tasks.push(subtask("T7", "delivered"));
  const v = view(tasks, { thr_t7: live(500) }, {}, {
    status: "blocked", statusRaw: "blocked (runtime activation unavailable; no active worker)",
    checkpoint: { text: "Old accepted result.\nCurrent runtime gap remains open.", at: null },
  });
  assert.equal(v.state, "stuck");
  assert.equal(v.phase.kind, "blocked");
  assert.equal(v.sections.status.word, "Blocked");
  assert.match(v.phase.detail!, /runtime activation unavailable/);
  assert.equal(v.sections.status.sentence, "Runtime activation unavailable; no active worker");
  assert.equal(v.sections.status.progress, "6 of 7 parts done");
  assert.equal(v.active[0]!.step, "Delivered, waiting for the gate");
  assert.equal(v.done.length, 6);
});

test("explicit closure, wrapping up, paused and reopened work have distinct phases", () => {
  const tasks = [subtask("T1", "verified")];
  assert.equal(view(tasks, {}, {}, { status: "closed" }).phase.kind, "closed");
  assert.equal(view(tasks, {}).phase.kind, "wrapping");
  assert.equal(view(tasks, {}, {}, { status: "paused" }).state, "stuck");
  const reopened = view(tasks, { thr_t1: live(1, { status: "active" }) }, {}, { status: "closed" });
  assert.equal(reopened.phase.kind, "inconsistent");
  assert.notEqual(reopened.state, "done");
  assert.equal(reopened.done.length, 0);
});

test("running counts use live activity including unlisted children, not task state", () => {
  const tasks = [subtask("T1", "working"), subtask("T2", "gate")];
  const idle = view(tasks, { thr_t1: live(1), thr_t2: live(1) });
  assert.equal(idle.phase.kind, "gate");
  const active = view(tasks, { thr_t1: live(1, { status: "active" }) });
  assert.equal(active.phase.kind, "running");
});

test("a pending owner question does not hide the orchestration blocker", () => {
  const v = view([subtask("T1", "delivered")], {}, {}, {
    status: "blocked", forTheOwner: ["ask: Choose the activation route"],
  });
  assert.equal(v.state, "needs");
  assert.equal(v.phase.kind, "blocked");
  assert.equal(v.sections.status.sentence, "1 question · blocked: the ledger says the orchestration is blocked");
});


test("a missing goal does not erase phase or its recorded qualification", () => {
  const v = view([subtask("T7", "delivered")], { thr_t7: live(1) }, {}, {
    goal: null, status: "blocked", statusRaw: "blocked (activation route required)",
  });
  assert.equal(v.recap.goal, null);
  assert.equal(v.phase.label, "Orchestration blocked");
  assert.equal(v.phase.detail, "blocked (activation route required)");
  assert.equal(v.sections.status.word, "Blocked");
  assert.equal(v.sections.status.sentence, "Activation route required");
});

test("a pending prompt in a ready subtask's thread is its card, so it can be answered there", () => {
  const v = view([subtask("S7", "ready", { delivery: "PR #41" })], { thr_s7: live(2, { hasPendingInteraction: true, pending: { kind: "approval", title: "Approve a command", text: "git push" } }) });
  assert.deepEqual(v.asks.map((a) => [a.kind, a.title]), [["thread", "Approve a command"]]);
});

test("a blocked note keeps its own case", () => {
  const v = view([subtask("S2", "blocked", { statusRaw: "blocked — API key missing" }), subtask("S3", "blocked", { statusRaw: "blocked: S2 must land first" })], {});
  assert.deepEqual(v.active.map((r) => r.step), ["Blocked: API key missing", "Blocked: S2 must land first"]);
});

test("an answered ledger line no longer hides the landing card", () => {
  const ready = subtask("T2", "ready", { delivery: "PR #41" });
  const line = "ask: T2: Pick a store name | options: Atlas / Orbit";
  const open = view([ready], {}, {}, { forTheOwner: [line] });
  assert.deepEqual(open.asks.map((a) => a.kind), ["owner"]);
  const answered = buildView({ ledger: ledger([ready], { forTheOwner: [line] }), agents: {}, live: {}, orchestratorThreadId: "thr_orch", now: NOW,
    answered: { "T2: Pick a store name": { answer: "Atlas", at: NOW - MIN } } });
  assert.deepEqual(answered.asks.map((a) => a.kind), ["decision"]);
});

test("a hand-written `Q (asked …):` line needs you, and the owner's `Re «title»:` reply answers it", async () => {
  const { askFirstSeen, answeredAsks } = await import("../src/answered.ts");
  const line = "Q (asked 2026-11-16): accept T9 group 4 boards ThreatDrawIntro (thread-storage/thr_qvipv6ji7b/boards) — 4.2 red tests done @03169c0d8 local";
  const at = (answered: Record<string, { answer: string; at: number }>) =>
    buildView({ ledger: ledger([subtask("T9", "working")], { forTheOwner: [line] }), agents: {}, live: { thr_t9: live(1) }, orchestratorThreadId: "thr_orch", now: NOW, answered });
  const open = at({});
  assert.equal(open.sections.status.word, "Needs you");
  const ask = open.asks[0]!;
  assert.equal(ask.title, "Accept «T9 name» group 4 boards ThreatDrawIntro (thread-storage/thr_qvipv6ji7b/boards) — 4.2 red tests done local", "cleaned for reading; a path keeps its thread id");
  assert.equal(ask.replyTitle, "accept T9 group 4 boards ThreatDrawIntro (thread-storage/thr_qvipv6ji7b/boards) — 4.2 red tests done @03169c0d8 local");
  const since = askFirstSeen([line], { [line]: NOW - 10 * MIN });
  const answered = answeredAsks(since, [{ text: `Re «${ask.replyTitle}»: Accept all four`, at: NOW - MIN }]);
  assert.deepEqual(at(answered).asks, []);
  assert.deepEqual(answeredAsks(since, [{ text: `Re «${ask.replyTitle}»: Accept all four`, at: NOW - 20 * MIN }]), {}, "an answer from before the ask doesn't close it");
});

const FREE = (n: number) => Array.from({ length: n }, (_, i) => `Waiting: owner decision ${i + 1}`);

test("the us26 free-text line on an active ledger needs you, on a closed ledger it does not", () => {
  const line = "connect Pixel 9a (5C111JEBF10513) via USB/wireless debugging, app signed in on drma-dy → device check resumes in thr_bjp39sjv29";
  const open = view([subtask("S1", "working")], { thr_s1: live(1) }, {}, { forTheOwner: [line] });
  assert.equal(open.state, "needs");
  assert.equal(open.asks.length, 1);
  assert.equal(open.asks[0]!.freeText, true);
  const closed = view([subtask("S1", "landed")], { thr_s1: live(1) }, {}, { forTheOwner: [line], status: "closed" });
  assert.notEqual(closed.state, "needs");
  assert.deepEqual(closed.history.freeTextNotes, [line]);
});

test("five free-text lines are five cards; six are one grouped card counted once", () => {
  assert.equal(view([subtask("S1", "working")], { thr_s1: live(1) }, {}, { forTheOwner: FREE(5) }).asks.length, 5);
  const v = view([subtask("S1", "working")], { thr_s1: live(1) }, {}, { forTheOwner: FREE(6) });
  assert.equal(v.asks.length, 1);
  assert.equal(v.asks[0]!.group?.length, 6);
  assert.equal(v.sections.status.word, "Needs you");
});

test("in a grouped card an answer marks its line; the card leaves needs-you only when all are answered", () => {
  const lines = FREE(6);
  const answers = (n: number) => Object.fromEntries(lines.slice(0, n).map((l) => [l, { answer: "ok", at: NOW }]));
  const run = (n: number) => buildView({ ledger: ledger([subtask("S1", "working")], { forTheOwner: lines }), agents: {}, live: { thr_s1: live(1) }, orchestratorThreadId: "thr_orch", now: NOW, answered: answers(n) });
  const some = run(5);
  assert.equal(some.asks.length, 1);
  assert.equal(some.asks[0]!.group!.filter((g) => g.answered).length, 5);
  const all = run(6);
  assert.equal(all.asks.length, 0);
  assert.equal(all.answered.length, 1);
});

test("a `T2: …` free-text line keeps its label inside the group", () => {
  const lines = [...FREE(5), "S1: pick the colour"];
  const v = view([subtask("S1", "working")], { thr_s1: live(1) }, {}, { forTheOwner: lines });
  assert.equal(v.asks[0]!.group!.at(-1)!.subtask, "S1");
});

const nowBlock = (extra: Partial<NonNullable<LedgerSummary["now"]>> = {}): NonNullable<LedgerSummary["now"]> =>
  ({ structured: true, updated: new Date(NOW - 60 * MIN).toISOString(), doing: "I2 — checks running", waitingOn: [], next: "on R1's report", blockedBy: null, backgroundWaits: [], ...extra });
const act = (extra: Partial<ThreadActivity> = {}): ThreadActivity => ({ turnStartedAt: null, lastTurnStartedAt: null, step: null, stepStartedAt: null, background: [], ...extra });
function nowOf(opts: { now?: LedgerSummary["now"]; checkpoint?: string; lives?: Record<string, LiveThread>; activity?: Record<string, ThreadActivity | null>; report?: string | null; subtasks?: Subtask[]; ledgerModifiedAt?: number | null; extra?: Partial<LedgerSummary> } = {}) {
  const checkpoint = opts.checkpoint ? { text: opts.checkpoint, at: null } : null;
  return buildView({
    ledger: ledger(opts.subtasks ?? [subtask("S1", "working")], { now: opts.now ?? null, checkpoint, ...opts.extra }),
    agents: {}, live: opts.lives ?? { thr_orch: live(5) }, orchestratorThreadId: "thr_orch", now: NOW,
    activity: opts.activity, report: opts.report === undefined ? null : opts.report === null ? null : { text: opts.report }, ledgerModifiedAt: opts.ledgerModifiedAt,
  });
}

test("view.now from a structured block carries doing, next, blocked by and the header age", () => {
  const v = nowOf({ now: nowBlock({ blockedBy: "CI is down" }), report: "D2 working: drafted\nmore", lives: { thr_orch: live(5) }, activity: { thr_orch: act({ lastTurnStartedAt: NOW - 90 * MIN }) } });
  assert.equal(v.now.source, "block");
  assert.equal(v.now.doing, "I2 — checks running");
  assert.equal(v.now.next, "on R1's report");
  assert.equal(v.now.blockedBy, "CI is down");
  assert.equal(v.now.updated.label, "updated 1h ago");
  assert.equal(v.now.orchestrator.state, "idle");
  assert.deepEqual(v.now.lastTurn, { text: "D2 working: drafted", age: "5m" });
});

test("view.now is stale only when the last turn started more than STALE_GRACE_MS after the block", () => {
  const updated = NOW - 60 * MIN;
  const block = nowBlock({ updated: new Date(updated).toISOString() });
  const stale = nowOf({ now: block, activity: { thr_orch: act({ lastTurnStartedAt: updated + STALE_GRACE_MS + 1000 }) } });
  assert.equal(stale.now.updated.stale, true);
  assert.equal(stale.now.updated.label, "updated 1h ago · the orchestrator has run since");
  const fresh = nowOf({ now: block, activity: { thr_orch: act({ lastTurnStartedAt: updated + STALE_GRACE_MS - 1000 }) } });
  assert.equal(fresh.now.updated.stale, false);
});

test("a block written early in a turn that ran 15 minutes is not stale", () => {
  const updated = NOW - 20 * MIN;
  const v = nowOf({ now: nowBlock({ updated: new Date(updated).toISOString() }), lives: { thr_orch: live(2) }, activity: { thr_orch: act({ lastTurnStartedAt: updated - MIN }) } });
  assert.equal(v.now.updated.stale, false);
});

test("without activity the stale rule falls back to the turn's end", () => {
  const updated = NOW - 60 * MIN;
  const v = nowOf({ now: nowBlock({ updated: new Date(updated).toISOString() }), lives: { thr_orch: live(5) }, activity: { thr_orch: null } });
  assert.equal(v.now.updated.stale, true);
});

test("a free-text checkpoint reads as source text with the ledger's age", () => {
  const v = nowOf({ now: nowBlock({ structured: false, updated: null, doing: null, next: null }), checkpoint: "GO9 done; waiting", ledgerModifiedAt: NOW - 3 * MIN });
  assert.equal(v.now.source, "text");
  assert.equal(v.now.text, "GO9 done; waiting");
  assert.equal(v.now.updated.label, "ledger written 3m ago");
  assert.equal(v.now.doing, null);
});

test("an export without the Now block has source none", () => {
  const v = nowOf({ now: null, checkpoint: "old text" });
  assert.equal(v.now.source, "none");
  assert.equal(v.now.doing, null);
});

test("no sidebar entry for the orchestrator is state unknown", () => {
  const v = nowOf({ now: nowBlock(), lives: {} });
  assert.equal(v.now.orchestrator.state, "unknown");
  assert.equal(v.now.lastTurn, null);
});

test("a running orchestrator shows its step and age, and does not fail without activity", () => {
  const running = { thr_orch: live(0, { status: "active" }) };
  const withStep = nowOf({ now: nowBlock(), lives: running, report: "old", activity: { thr_orch: act({ turnStartedAt: NOW - 4 * MIN, step: "Running npm test", stepStartedAt: NOW - 40_000 }) } });
  assert.equal(withStep.now.orchestrator.state, "running");
  assert.equal(withStep.now.orchestrator.activity, "Running npm test · 40s");
  assert.equal(withStep.now.orchestrator.age, "4m");
  assert.equal(withStep.now.lastTurn, null);
  const without = nowOf({ now: nowBlock(), lives: running, activity: { thr_orch: null } });
  assert.equal(without.now.orchestrator.state, "running");
  assert.equal(without.now.orchestrator.activity, null);
});

test("mismatch: idle, no open ask and a report ending Waiting on you", () => {
  const idle = { thr_orch: live(5) };
  assert.equal(nowOf({ now: nowBlock(), lives: idle, report: "Done.\nWaiting on you: connect the Pixel" }).now.mismatch, true);
  assert.equal(nowOf({ now: nowBlock(), lives: { thr_orch: live(0, { status: "active" }) }, report: "Done.\nWaiting on you: connect the Pixel" }).now.mismatch, false);
  assert.equal(nowOf({ now: nowBlock(), lives: idle, report: "Done.\nNothing waits on you." }).now.mismatch, false);
});

test("an owner wait line and its matching ask give one You row", () => {
  const v = nowOf({
    now: nowBlock({ waitingOn: [{ who: "owner", subtask: null, what: "«Merge the orchestrate plugin PR (I1) …»", since: new Date(NOW - 28 * MIN).toISOString() }] }),
    extra: { forTheOwner: ["ask: Merge the orchestrate plugin PR (I1) yourself | why: x"] },
  });
  assert.equal(v.now.waits.filter((w) => w.label === "You").length, 1);
  assert.equal(v.now.waits[0]!.age, "28m");
});

test("a working row shows the report's gist, not its protocol header", () => {
  const v = view([subtask("T1", "working")], { thr_t1: live(2) }, { thr_t1: agent({ lastOutput: "[orchestrate slug] T1 working: sections 1–3 drafted\nmore" }) });
  assert.equal(v.active[0]!.step, "sections 1–3 drafted");
  assert.equal(v.active[0]!.lastReport, "working: sections 1–3 drafted · 2m");
});

test("a working status note is the step", () => {
  const v = view([subtask("T1", "working", { statusRaw: "working — drafting sections 1–3" })], { thr_t1: live(2) });
  assert.equal(v.active[0]!.step, "Drafting sections 1–3");
  assert.equal(v.active[0]!.status, "working — drafting sections 1–3");
});

test("a running row shows its live step and age", () => {
  const v = buildView({
    ledger: ledger([subtask("T1", "working")]), agents: {}, live: { thr_t1: live(0, { status: "active" }) }, orchestratorThreadId: "thr_orch", now: NOW,
    activity: { thr_t1: act({ turnStartedAt: NOW - 2 * MIN, step: "Running npm test", stepStartedAt: NOW - 40_000 }) },
  });
  assert.equal(v.active[0]!.step, "Running npm test · 40s");
});

test("a row is named by its delivery (the ledger puts it in the name), never by the slug of its thread title", () => {
  const named = view([subtask("T3", "working", { name: "PR #41" })], { thr_t3: live(2, { title: "cozy-redesign · T3" }) });
  assert.equal(named.active[0]!.name, "PR #41");
  assert.equal(named.active[0]!.label, "T3");
});

test("a row with no name or delivery falls back to its status note, which the step does not repeat, and then to its id", () => {
  const note = view([subtask("T4", "working", { name: null, statusRaw: "working — fixing the gate" })], { thr_t4: live(2) });
  assert.equal(note.active[0]!.name, "fixing the gate");
  assert.notEqual(note.active[0]!.step.toLowerCase(), "fixing the gate");
  const bare = view([subtask("T5", "working", { name: null, statusRaw: "working" })], { thr_t5: live(2) });
  assert.equal(bare.active[0]!.name, "T5");
  assert.equal(bare.active[0]!.label, "");
});

test("a pending thread question does not hide a mismatch: only owner asks count", () => {
  const v = nowOf({ now: nowBlock(), lives: { thr_orch: live(5), thr_s1: live(2, { hasPendingInteraction: true }) }, report: "Done.\nWaiting on you: connect the Pixel" });
  assert.equal(v.now.mismatch, true);
});

const LEDGER_CARD = [
  "I'd like to record your instructions in the task ledger.",
  "",
  "```ui",
  'Card("Allow recording these instructions in the task ledger?", [',
  '  Button("Allow ledger update"),',
  '  Button("Leave ledger unchanged")',
  "])",
  "```",
].join("\n");

test("the chat-ask card shows the question from the ui card with its choices, its age and an Open chat target", () => {
  const v = nowOf({ now: nowBlock(), lives: { thr_orch: live(7) }, report: LEDGER_CARD });
  assert.equal(v.now.mismatch, true);
  const ask = v.asks.find((a) => a.key === "chat-mismatch")!;
  assert.equal(ask.title, "Allow recording these instructions in the task ledger?");
  assert.match(ask.text, /Choices: «Allow ledger update» \/ «Leave ledger unchanged»/);
  assert.equal(ask.age, "7m");
  assert.equal(v.threadIds["chat-mismatch"], "thr_orch");
  assert.doesNotMatch(`${ask.title} ${ask.text}`, /```|Button\(|Card\(/);
});

test("chatQuestion reads Form fields, Buttons lists, a Waiting on you line, else the last paragraph", () => {
  const form = chatQuestion('```ui\nForm("Where should the build go?", [\n  TextInput("Host name"),\n  Select("Channel", ["beta", "stable"]),\n  Button("Send")\n])\n```');
  assert.deepEqual(form, { identity: "Where should the build go?", question: "Where should the build go?", choices: ["Send", "beta", "stable"], fields: ["Host name", "Channel"] });
  assert.deepEqual(chatQuestion('Pick one.\n```ui\nCard("Land D3 now?", [Buttons(["Land", "Wait"])])\n```')?.choices, ["Land", "Wait"]);
  assert.equal(chatQuestion("Done with I2.\nWaiting on you: connect the Pixel\n::browser-preview{session=\"x\"}")?.question, "connect the Pixel");
  assert.equal(chatQuestion("First part.\n\nShould I rotate V1 now?\n\n```sh\nls\n```")?.question, "Should I rotate V1 now?");
  assert.equal(chatQuestion(null), null);
});

const REVIEW_QUESTION = "Does the new Orchestration view look right?";
const REVIEW_CLOSING = "Waiting on you: a look at the new view in this thread's Orchestration view, using «Looks right» or «Something's off» above. Once it looks right I'll close the orchestration. Two follow-ups you approved are still to do: people-friendly ledger notes and correct times (Q5/Q6), and a progress strip (Q10).";

test("chat matching distinguishes corresponding open, unrelated, notes-only, answered and re-asked questions", () => {
  const report = `Waiting on you: ${REVIEW_QUESTION}`;
  const make = (forTheOwner: string[], answered = {}, lastTurnStartedAt = NOW - 10 * MIN) => buildView({
    ledger: ledger([], { forTheOwner }), agents: {}, live: { thr_orch: live(5) },
    orchestratorThreadId: "thr_orch", now: NOW, report: { text: report }, answered,
    activity: { thr_orch: act({ lastTurnStartedAt }) },
  });
  const line = `ask: ${REVIEW_QUESTION} | why: Your review is needed before this orchestration closes. | options: Looks right / Something's off`;
  const open = make([line]);
  assert.equal(open.asks.length, 1);
  assert.equal(open.asks[0]!.key, "owner-0");
  assert.deepEqual(open.asks[0]!.replies.map((r) => r.label), ["Looks right", "Something's off"]);
  assert.equal(open.now.mismatch, false);
  const unrelated = make(["ask: Allow publication? | options: Yes / No"]);
  assert.equal(unrelated.asks.length, 2);
  assert.equal(unrelated.asks[0]!.key, "chat-mismatch");
  const notes = make(["note: Review is next"]);
  assert.equal(notes.asks.length, 1);
  const answer = { [REVIEW_QUESTION]: { answer: "Looks right", at: NOW - 8 * MIN } };
  const stale = make([line], answer);
  assert.equal(stale.asks.length, 0);
  assert.equal(stale.answered.length, 1);
  assert.notEqual(stale.sections.status.word, "Needs you");
  const waiting = buildView({
    ledger: ledger([], { forTheOwner: [line], now: nowBlock({ waitingOn: [{ who: "owner", subtask: null, what: REVIEW_QUESTION, since: null }] }) }),
    agents: {}, live: { thr_orch: live(5) }, orchestratorThreadId: "thr_orch", now: NOW,
    report: { text: report }, answered: answer,
  });
  assert.equal(waiting.asks.length, 0);
  assert.equal(waiting.now.waits.filter((w) => w.kind === "owner").length, 0);
  const again = make([line], answer, NOW - 6 * MIN);
  assert.equal(again.asks[0]!.key, "chat-mismatch");
  assert.equal(again.asks[0]!.replyTitle, null);
  assert.deepEqual(again.asks[0]!.replies, []);
});

test("title matching ignores punctuation/case but does not guess paraphrases", () => {
  const match = (title: string) => nowOf({ now: nowBlock(), lives: { thr_orch: live(5) }, report: `Waiting on you: ${REVIEW_QUESTION}`, extra: { forTheOwner: [`ask: ${title}`] } }).now.mismatch;
  assert.equal(match("does the new Orchestration view look right"), false);
  assert.equal(match("Does the old Orchestration view look right?"), true);
  assert.equal(match("Review the layout?"), true);
});

for (const [label, title] of [
  ["noncanonical review phrasing", "Review the new Orchestration view?"],
  ["long title", `Should we approve ${"the proposed layout and keyboard behavior ".repeat(6)}for this release?`],
] as const) {
  test(`original question identity matches open and answered asks: ${label}`, () => {
    const make = (ledgerTitle: string = title, answered = false, laterTurn = false) => buildView({
      ledger: ledger([], { forTheOwner: [`ask: ${ledgerTitle} | options: Yes / No`] }),
      agents: {}, live: { thr_orch: live(5) }, orchestratorThreadId: "thr_orch", now: NOW,
      report: { text: `Waiting on you: ${title}` },
      answered: answered ? { [ledgerTitle]: { answer: "Yes", at: NOW - 8 * MIN } } : {},
      activity: { thr_orch: act({ lastTurnStartedAt: NOW - (laterTurn ? 6 : 10) * MIN }) },
    });
    const extracted = chatQuestion(`Waiting on you: ${title}`)!;
    assert.equal(extracted.identity, title);
    assert.notEqual(extracted.question, title);
    const open = make();
    assert.deepEqual(open.asks.map((a) => a.key), ["owner-0"]);
    assert.equal(open.now.mismatch, false);
    const answered = make(title, true);
    assert.deepEqual(answered.asks, []);
    assert.equal(answered.answered.length, 1);
    assert.equal(answered.now.mismatch, false);
    assert.deepEqual(make(title, true, true).asks.map((a) => a.key), ["chat-mismatch"]);
    assert.deepEqual(make("Allow publication?").asks.map((a) => a.key), ["chat-mismatch", "owner-0"]);
  });
}

test("incident closing line has a concise title, separate context, and never searches a previous report", () => {
  const question = chatQuestion(REVIEW_CLOSING)!;
  assert.equal(question.question, REVIEW_QUESTION);
  assert.match(question.context!, /Q5\/Q6.*Q10/);
  assert.doesNotMatch(question.question, /Q5|Q6|Q10|follow-ups/);
  const v = nowOf({ now: nowBlock(), lives: { thr_orch: live(5) }, report: REVIEW_CLOSING });
  const card = v.asks[0]!;
  assert.equal(card.title, REVIEW_QUESTION);
  assert.match(card.text, /Reply here when you're ready/);
  assert.doesNotMatch(`${card.title} ${card.text}`, /isn't in its ledger|ledger doesn't record/);
  const old = chatQuestion('```ui\nCard("Old answered question?", [Button("Yes")])\n```');
  assert.equal(old?.question, "Old answered question?");
  assert.equal(chatQuestion(REVIEW_CLOSING)?.question, REVIEW_QUESTION);
  assert.equal(nowOf({ now: nowBlock(), lives: { thr_orch: live(5) }, report: "Finished. Nothing waits on you." }).asks.length, 0);
});

test("quiet comes from the thread's live state: a running turn with recent activity is never quiet", () => {
  const reportedLongAgo = (status: string, activity: Partial<ThreadActivity> | null) => buildView({
    ledger: ledger([subtask("S5", "working")]), agents: {}, orchestratorThreadId: "x", now: NOW,
    live: { thr_s5: live(45, { status }) }, activity: { thr_s5: activity === null ? null : act(activity) },
  });
  const busy = reportedLongAgo("active", { turnStartedAt: NOW - 50 * MIN, step: "Running npm test", stepStartedAt: NOW - 2 * MIN });
  assert.notEqual(busy.state, "stuck", "last report 45 min ago, but the turn is running and stepped 2 min ago");
  assert.equal(busy.nudge, null);
  assert.notEqual(reportedLongAgo("active", null).state, "stuck", "a running turn without activity data is not quiet");
  const longStep = reportedLongAgo("active", { turnStartedAt: NOW - 50 * MIN, step: "Running npm test", stepStartedAt: NOW - 40 * MIN });
  assert.notEqual(longStep.state, "stuck", "one long step 40 min in is still a running turn, never quiet");
  assert.notEqual(reportedLongAgo("active", { turnStartedAt: NOW - 35 * MIN }).state, "stuck", "thinking between tools 35 min into a turn is not quiet");
  assert.equal(reportedLongAgo("idle", null).state, "stuck", "positive control: an idle thread with no report for 45 min");
});

test("a live tool step is shown as-is, not cleaned like ledger text", () => {
  const v = buildView({
    ledger: ledger([subtask("S5", "working")]), agents: {}, orchestratorThreadId: "x", now: NOW,
    live: { thr_s5: live(1, { status: "active" }) }, activity: { thr_s5: act({ turnStartedAt: NOW - 3 * MIN, step: "Running rm -f $D/r3-*", stepStartedAt: NOW - 15_000 }) },
  });
  assert.match(v.sections.working[0]!.detail!, /^Running rm -f \$D\/r3-\* · 15s$/);
  assert.match(v.sections.status.sentence, /rm -f \$D\/r3-\*/);
  assert.doesNotMatch(v.sections.status.sentence, /round 3/);  const range = buildView({
    ledger: ledger([subtask("S5", "working")]), agents: {}, orchestratorThreadId: "x", now: NOW,
    live: { thr_s5: live(1, { status: "active" }) }, activity: { thr_s5: act({ turnStartedAt: NOW - 3 * MIN, step: "Running git log a1b2c3d..b4c5d6e", stepStartedAt: NOW - 15_000 }) },
  });
  assert.match(range.sections.working[0]!.detail!, /git log a1b2c3d\.\.b4c5d6e/);
});


test("active descendants of a completed coordinator reopen overall progress without rewriting its delivery", () => {
  const tasks = [subtask("T1", "verified", { threadId: "thr_coord" })];
  const threads = {
    thr_coord: live(10, { parentThreadId: "thr_orch" }),
    thr_middle: live(5, { parentThreadId: "thr_coord" }),
    thr_worker: live(0, { status: "active", parentThreadId: "thr_middle", title: "Winner badges" }),
    thr_other: live(0, { status: "active", parentThreadId: "thr_unrelated" }),
    thr_cyclea: live(0, { status: "active", parentThreadId: "thr_cycleb" }),
    thr_cycleb: live(0, { status: "active", parentThreadId: "thr_cyclea" }),
  };
  const v = view(tasks, threads);
  assert.equal(v.state, "moving");
  assert.equal(v.sections.status.word, "In progress");
  assert.equal(v.sections.status.progress, "1 of 2 parts done");
  assert.deepEqual(v.active.map((r) => r.id), ["thr_worker"]);
  assert.deepEqual(v.done.map((r) => r.id), ["T1"]);
  assert.equal(v.phase.kind, "running");
  assert.equal(view(tasks, { ...threads, thr_worker: live(0, { parentThreadId: "thr_middle" }) }).state, "done");
  assert.equal(view(tasks, threads, {}, { status: "closed" }).phase.kind, "inconsistent");
});

test("a ledger-linked nested coordinator anchors live descendants even outside the root's BB parent tree", () => {
  const v = view([subtask("T1", "verified", { threadId: "thr_nested" })], {
    thr_nested: live(2, { parentThreadId: "thr_otherroot" }),
    thr_child: live(0, { status: "active", parentThreadId: "thr_nested" }),
  });
  assert.equal(v.sections.status.word, "In progress");
  assert.equal(v.active[0]?.id, "thr_child");
});

test("pending input in a descendant needs attention; idle descendants alone are not unfinished work", () => {
  const v = view([subtask("T1", "verified")], {
    thr_t1: live(5),
    thr_child: live(0, { parentThreadId: "thr_t1", hasPendingInteraction: true }),
  });
  assert.equal(v.state, "needs");
  assert.equal(v.asks[0]?.key, "thr_child");
});

test("all recorded tasks finished while the orchestrator is active is not overall Done", () => {
  const v = view([subtask("T1", "verified")], { thr_orch: live(0, { status: "active" }) });
  assert.equal(v.sections.status.word, "In progress");
  assert.equal(v.phase.kind, "running");
});
