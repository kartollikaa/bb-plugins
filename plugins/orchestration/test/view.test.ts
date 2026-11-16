import { test } from "node:test";
import assert from "node:assert/strict";
import type { Agent, LedgerSummary, Subtask } from "../src/contract.ts";
import { askIdentity, buildView, childLabel, firstLine, longAge, prettyModel, shortAge, type LiveThread } from "../src/view.ts";

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
  assert.equal(v.heading, "Planning the work");
});

test("all moving: nothing needs you, with progress and the freshest report", () => {
  const v = view(
    [subtask("S1", "landed"), subtask("S2", "working"), subtask("S3", "waiting-dependency", { dependsOn: ["S1", "S2"] })],
    { thr_s2: live(3), thr_s1: live(100) },
  );
  assert.equal(v.state, "moving");
  assert.equal(v.heading, "Nothing needs you");
  assert.equal(v.subline, "2 waiting · 1 of 3 done · latest report 3m ago");
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
  assert.equal(v.subline, "Waiting · no agent running · 0 of 2 done");
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
  assert.equal(bare.title, "S7 passed the gate and waits for your word to land");
  assert.match(bare.text, /names no branch, version or gate/);
});

test("a «For the owner» line on a ready subtask's thread replaces its landing card", () => {
  const plan = subtask("T1", "ready", { statusRaw: "ready — plan verified; waits on owner's answers and folder review", threadId: "thr_t1", name: "branch plan (no PR)" });
  const v = view([plan], { thr_t1: live(8) }, {}, { forTheOwner: ["ask: Answer the 6 plan questions | thread: thr_t1 | options: All as recommended / One by one"] });
  assert.equal(v.heading, "One thing waits on you");
  assert.deepEqual(v.asks.map((a) => [a.kind, a.who, a.subtask]), [["owner", "T1 · branch plan (no PR)", "T1"]]);
  assert.deepEqual(v.asks[0]!.threads, ["thr_t1"]);
  assert.equal(v.subline, "Waiting · no agent running · 0 of 1 done", "a subtask waiting on the owner is not waiting on a landing");
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
  assert.equal(v.heading, "2 things need you");
  assert.deepEqual(v.asks.map((a) => a.key), ["S7", "owner-0"]);
  assert.equal(v.asks[1]!.drafts!.primary, "Re «Merge hub#38»: ");
  const only = view([subtask("S2", "working")], { thr_s2: live(1) }, {}, { forTheOwner: ["ask: Confirm the window"] });
  assert.equal(only.heading, "One thing waits on you");
  assert.equal(only.state, "needs");
});

test("an open ask doesn't hide a stuck agent: the subline and the context row name it", () => {
  const v = view([subtask("S5", "working"), subtask("S6", "working"), subtask("S1", "landed")], { thr_s5: live(52), thr_s6: live(2) }, {},
    { forTheOwner: ["ask: Merge hub#38"] });
  assert.equal(v.state, "needs");
  assert.equal(v.heading, "One thing waits on you");
  assert.equal(v.subline, "S5 has gone quiet · 1 of 3 done");
  assert.equal(v.rowLabel, "One thing waits on you · S5 has gone quiet");
  assert.equal(v.nudge!.draft, "What is S5 doing? It hasn't reported for 52 min.");
  const calm = view([subtask("S6", "working")], { thr_s6: live(2) }, {}, { forTheOwner: ["ask: x"] });
  assert.equal(calm.subline, "Waiting · no agent running · 0 of 1 done");
  assert.equal(calm.rowLabel, "One thing waits on you");
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
  assert.equal(quiet.heading, "Nothing needs you, but S5 has gone quiet");
  assert.equal(quiet.subline, "No report from S5 for 52 min. Everyone else reported in the last 4 min.");
  assert.equal(quiet.active[0]!.id, "S5");
  assert.equal(quiet.active[0]!.step, "Quiet for 52 min · last: Writing tests for the fold threshold");
  assert.equal(quiet.nudge!.draft, "What is S5 doing? It hasn't reported for 52 min.");
  assert.equal(quiet.rowLabel, quiet.heading);
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
  const closed = view([subtask("S1", "verified"), subtask("S2", "working")], {}, {}, { status: "closed" });
  assert.equal(closed.heading, "Closed, but work is still open");
  assert.equal(closed.subline, "1 of 2 done · 0 agents running");
  assert.equal(view([subtask("S1", "landed")], {}).heading, "The only subtask is done");
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
  assert.equal(v.heading, "One thing waits on you");
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
  assert.equal(v.heading, "Nothing needs you");
  assert.deepEqual(v.history.notes, ["Nothing waiting. Store PR get-bb/marketplace#958 waits on a maintainer.", "T4 accepted the pager slide"]);
});

test("an answered ledger ask stops needing you at once and waits on the orchestrator", () => {
  const line = "ask: Remove orchestration bits from thread-tree? | options: keep both / remove";
  const title = "Remove orchestration bits from thread-tree?";
  const at = (answered: Record<string, { answer: string; at: number }>) =>
    buildView({ ledger: ledger([subtask("S2", "landed")], { forTheOwner: [line] }), agents: {}, live: {}, orchestratorThreadId: "thr_orch", now: NOW, answered });
  const open = at({});
  assert.equal(open.heading, "One thing waits on you", "positive control: unanswered, it needs you");
  assert.equal(open.asks.length, 1);
  const done = at({ [title]: { answer: "keep both", at: NOW - MIN } });
  assert.deepEqual(done.asks, []);
  assert.equal(done.state, "done");
  assert.match(done.subline, /1 answer waits on the orchestrator\.$/);
  assert.doesNotMatch(open.subline, /waits on the orchestrator/);
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
  assert.equal(v.heading, "Nothing needs you, but T2 is blocked");
  assert.equal(v.subline, "Blocked: no access to the registry.");
  assert.equal(v.active[0]!.step, "Blocked: no access to the registry");
  assert.equal(v.nudge!.draft, "What is T2 blocked on, and what would unblock it?");
  assert.equal(view([subtask("T2", "blocked")], {}).active[0]!.step, "Blocked");
});

test("a subtask going in circles outranks a blocked one", () => {
  const v = view([subtask("T2", "blocked"), subtask("T3", "gate", { gateFailures: 3, lastFailedKind: "review" })], {});
  assert.equal(v.heading, "Nothing needs you, but T3 is going in circles");
});

test("an owner line that names a subtask first is that subtask's ask, with its thread", () => {
  const v = view([subtask("T2", "delivered")], {}, {}, { forTheOwner: ["ask: T2: Approve the draft | options: Approve / Rework", "ask: X9: Not a subtask"] });
  const [named, other] = v.asks;
  assert.equal(named!.who, "T2 · T2 name");
  assert.equal(named!.subtask, "T2");
  assert.equal(named!.title, "Approve the draft");
  assert.equal(named!.replyTitle, "T2: Approve the draft");
  assert.equal(named!.replies[0]!.draft, "Re «T2: Approve the draft»: Approve");
  assert.deepEqual(named!.threads, ["thr_t2"]);
  assert.equal(other!.who, "For you, from the ledger");
  assert.equal(other!.title, "X9: Not a subtask");
});

test("the recap carries the goal, the checkpoint and the latest decision with their ages", () => {
  const v = view([subtask("T1", "working")], {}, {}, {
    checkpoint: { text: "G1 waits on review of 9f1c2ab.\nmore", at: new Date(NOW - 40 * MIN).toISOString() },
    lastDecision: { text: "Review by R1", at: null },
  });
  assert.deepEqual(v.recap, { goal: "Goal", now: { text: "G1 waits on review of 9f1c2ab.", age: "40m" }, last: { text: "Review by R1", age: "" } });
  assert.deepEqual(view([], {}).recap, { goal: "Goal", now: null, last: null });
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
  assert.equal(v.subline, "2 agents running · 1 of 2 done · latest report 3m ago", "children work but don't count as planned subtasks");
});

test("a child that names a session-less ledger row becomes that row's thread", () => {
  const v = view([subtask("S11", "briefed", { threadId: null })], { thr_kid: live(2, { parentThreadId: "thr_orch", title: "orch · S11", status: "active" }) });
  assert.deepEqual(v.active.map((r) => [r.id, r.running, r.step]), [["S11", true, "Briefed, no reply yet"]]);
  assert.equal(v.threadIds.S11, "thr_kid");
});

test("a child waiting on approval is an ask; a landed subtask running again is active, not done", () => {
  const v = view([subtask("S1", "landed", { statusRaw: "landed abc; follow-up working" })], {
    thr_s1: live(1, { status: "active" }),
    thr_kid: live(4, { parentThreadId: "thr_orch", title: "orch · R2", hasPendingInteraction: true }),
  });
  assert.deepEqual(v.asks.map((a) => [a.key, a.who, a.kind, a.text]), [["thr_kid", "R2", "thread", "R2 waits on an approval or a question in its thread."]]);
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
  assert.deepEqual(v.asks.map((a) => [a.key, a.kind, a.text]), [["S1", "thread", "S1 waits on an approval or a question in its thread."]]);
});

test("a child asking while the ledger has no subtasks yet needs you", () => {
  const v = view([], { thr_kid: live(1, { parentThreadId: "thr_orch", title: "orch · S1", hasPendingInteraction: true }) });
  assert.equal(v.state, "needs");
  assert.equal(v.heading, "One question for you");
  assert.equal(v.rowLabel, "One question for you");
  assert.equal(v.subline, "The orchestrator is splitting the goal into subtasks.");
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
  assert.equal(v.heading, "Orchestration blocked");
  assert.match(v.phase.detail!, /runtime activation unavailable/);
  assert.equal(v.subline, "6 of 7 done · 0 agents running");
  assert.equal(v.activeLabel, "0 running");
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
  assert.equal(reopened.activeLabel, "1 running");
});

test("running counts use live activity including unlisted children, not task state", () => {
  const tasks = [subtask("T1", "working"), subtask("T2", "gate")];
  const idle = view(tasks, { thr_t1: live(1), thr_t2: live(1) });
  assert.equal(idle.activeLabel, "0 running");
  assert.equal(idle.phase.kind, "gate");
  const active = view(tasks, { thr_t1: live(1, { status: "active" }) });
  assert.equal(active.activeLabel, "1 running");
  assert.equal(active.phase.kind, "running");
});

test("a pending owner question does not hide the orchestration blocker", () => {
  const v = view([subtask("T1", "delivered")], {}, {}, {
    status: "blocked", forTheOwner: ["ask: Choose the activation route"],
  });
  assert.equal(v.state, "needs");
  assert.equal(v.phase.kind, "blocked");
  assert.match(v.subline, /Orchestration blocked/);
});


test("a missing goal does not erase phase or its recorded qualification", () => {
  const v = view([subtask("T7", "delivered")], { thr_t7: live(1) }, {}, {
    goal: null, status: "blocked", statusRaw: "blocked (activation route required)",
  });
  assert.equal(v.recap.goal, null);
  assert.equal(v.phase.label, "Orchestration blocked");
  assert.equal(v.phase.detail, "blocked (activation route required)");
  assert.equal(v.heading, "Orchestration blocked");
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
  assert.equal(open.heading, "One thing waits on you");
  const ask = open.asks[0]!;
  assert.equal(ask.title, "accept T9 group 4 boards ThreatDrawIntro (thread-storage/thr_qvipv6ji7b/boards) — 4.2 red tests done @03169c0d8 local");
  const since = askFirstSeen([line], { [line]: NOW - 10 * MIN });
  const answered = answeredAsks(since, [{ text: `Re «${ask.title}»: Accept all four`, at: NOW - MIN }]);
  assert.deepEqual(at(answered).asks, []);
  assert.deepEqual(answeredAsks(since, [{ text: `Re «${ask.title}»: Accept all four`, at: NOW - 20 * MIN }]), {}, "an answer from before the ask doesn't close it");
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
  assert.equal(v.heading, "One thing waits on you");
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
