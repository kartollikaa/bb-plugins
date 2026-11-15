import { test } from "node:test";
import assert from "node:assert/strict";
import { describePending } from "../src/pending.ts";
import { buildView, threadsToOpen, type LiveThread } from "../src/view.ts";

const provider = (payload: unknown, status = "pending") => ({ id: "i1", status, payload, threadId: "thr_x", createdAt: 1 });

test("a user question reads as its prompt and its options", () => {
  const one = describePending(provider({ kind: "user_question", questions: [{ id: "q", prompt: "Which save format?", options: [{ label: "v2", value: "v2", description: "keeps old saves" }, { label: "v3", value: "v3" }] }] }));
  assert.deepEqual(one, { kind: "question", title: "Which save format?", text: "- v2 — keeps old saves\n- v3" });
  const two = describePending(provider({ kind: "user_question", questions: [{ prompt: "A?" }, { prompt: "B?", options: [{ label: "yes" }] }] }));
  assert.equal(two!.title, "2 questions");
  assert.equal(two!.text, "**A?**\n\n**B?**\n- yes");
});

test("an approval reads as the command, plan, permission or tool it asks for", () => {
  assert.deepEqual(describePending(provider({ kind: "approval", reason: null, subject: { kind: "command", command: "git push", cwd: "/repo", itemId: "x" } })),
    { kind: "approval", title: "Approve a command", text: "```\ngit push\n```\nin `/repo`" });
  assert.equal(describePending(provider({ kind: "approval", reason: "ship it", subject: { kind: "plan", plan: "1. build" } }))!.text, "1. build\n\nship it");
  assert.deepEqual(describePending(provider({ kind: "approval", reason: null, subject: { kind: "permission_grant", toolName: "Bash", permissions: { fileSystem: { read: [], write: ["/out"] }, network: { enabled: true } } } })),
    { kind: "approval", title: "Grant Bash a permission", text: "Write: `/out`\nNetwork access" });
  assert.equal(describePending(provider({ kind: "approval", reason: null, subject: { kind: "tool_use", tool: "Write", presentation: { title: "Write proposal.md" } } }))!.title, "Write proposal.md");
});

test("resolved or unknown interactions describe nothing", () => {
  assert.equal(describePending(provider({ kind: "user_question", questions: [{ prompt: "A?" }] }, "resolved")), null);
  assert.equal(describePending(provider({ kind: "mystery" })), null);
  assert.equal(describePending(null), null);
});

const NOW = Date.UTC(2026, 10, 14, 12, 0);
const live = (extra: Partial<LiveThread> = {}): LiveThread => ({ status: "idle", hasPendingInteraction: true, latestAttentionAt: NOW - 60_000, createdAt: NOW - 600_000, ...extra });
const ledger = { path: "/l.md", goal: "Goal", status: "active", forTheOwner: [], orchestratorSessions: 1, lastHandover: null, warnings: [], checkpoint: null, lastDecision: null,
  subtasks: [{ id: "S2", name: "S2 name", threadId: "thr_s2", status: "question", statusRaw: "question", modelRaw: null, dependsOn: [], gateLine: null, gateFailures: 0, lastFailedKind: null, rotations: 0 }] };

test("a card for a pending interaction shows what it asks, not a stock sentence", () => {
  const question = { kind: "question" as const, title: "Which save format?", text: "- v2\n- v3" };
  const v = buildView({ ledger, agents: {}, orchestratorThreadId: "thr_orch", now: NOW,
    live: { thr_s2: live({ pending: question }), thr_orch: live({ pending: { kind: "approval", title: "Approve a command", text: "git push" } }) } });
  assert.deepEqual(v.asks.map((a) => [a.who, a.kind, a.title, a.text]), [
    ["S2 · S2 name", "thread", "Which save format?", "- v2\n- v3"],
    ["Orchestrator", "thread", "Approve a command", "git push"],
  ]);
  const unread = buildView({ ledger, agents: {}, orchestratorThreadId: "thr_orch", now: NOW, live: { thr_s2: live() } });
  assert.equal(unread.asks[0]!.text, "S2 waits on an approval or a question in its thread.");
});

test("only a prompt held in another thread offers Open thread; the rest answer the orchestrator", () => {
  const base = { key: "k", who: "T1", subtask: "T1", since: null, age: "", title: "t", replyTitle: "t", text: "", links: [], threads: ["thr_t1"], replies: [], answered: null, drafts: null };
  assert.deepEqual(threadsToOpen({ ...base, kind: "owner" }, "thr_t1"), []);
  assert.deepEqual(threadsToOpen({ ...base, kind: "decision" }, "thr_t1"), []);
  assert.deepEqual(threadsToOpen({ ...base, kind: "question" }, "thr_t1"), []);
  assert.deepEqual(threadsToOpen({ ...base, kind: "thread" }, "thr_t2"), ["thr_t2"]);
  assert.deepEqual(threadsToOpen({ ...base, kind: "thread" }, null), ["thr_t1"]);
});
