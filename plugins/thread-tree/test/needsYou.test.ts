import { test } from "node:test";
import assert from "node:assert/strict";
import {
  automationItems,
  describeQuestion,
  isSnoozed,
  nextItem,
  pruneSnoozes,
  pullRequestItems,
  readSnoozes,
  threadItemKind,
  threadItems,
  trackFirstSeen,
  type NeedsYouThread,
  type PendingInteraction,
} from "../src/needsYou.ts";
import type { ThreadPullRequest } from "../src/threadPullRequests.ts";
import type { AutomationSummary } from "../src/automations.ts";
import type { GithubFolderItem } from "../src/githubFolder.ts";

const thread = (id: string, extra: Partial<NeedsYouThread> = {}): NeedsYouThread => ({
  id,
  projectId: "p1",
  parentThreadId: null,
  lifecycleOwnerThreadId: null,
  isPinned: false,
  pinSortKey: null,
  pinnedAt: null,
  isHidden: false,
  isArchived: false,
  isUnread: false,
  status: "idle",
  indicator: "none",
  hasPendingInteraction: false,
  activity: { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 },
  createdAt: 0,
  updatedAt: 0,
  displayTitle: id,
  environment: null,
  queuedWork: "none",
  ...extra,
});

const none = () => null;
const build = (threads: NeedsYouThread[], extra: Partial<Parameters<typeof threadItems>[0]> = {}) =>
  threadItems({ threads, questions: new Map(), firstSeen: new Map(), orchestrationOf: none, ...extra });

test("a thread is one item at most: a question, else a failed turn, else a failed queued message, else a finished result to read", () => {
  assert.equal(threadItemKind(thread("q", { hasPendingInteraction: true, status: "error", isUnread: true })), "input");
  assert.equal(threadItemKind(thread("w", { indicator: "waiting-for-input" })), "input");
  assert.equal(threadItemKind(thread("f", { status: "error", queuedWork: "failed" })), "failed");
  assert.equal(threadItemKind(thread("ue", { indicator: "unread-error" })), "failed");
  assert.equal(threadItemKind(thread("qf", { indicator: "queued-failed" })), "queued-failed");
  assert.equal(threadItemKind(thread("qw", { queuedWork: "failed" })), "queued-failed");
  assert.equal(threadItemKind(thread("u", { isUnread: true })), "unread");
  assert.equal(threadItemKind(thread("running-unread", { isUnread: true, status: "active" })), null, "still working, nothing to review yet");
  assert.equal(threadItemKind(thread("waiting-unread", { isUnread: true, indicator: "queued-waiting" })), null, "its next turn is queued");
  assert.equal(threadItemKind(thread("read")), null);
  assert.equal(threadItemKind(thread("hidden", { status: "error", isHidden: true })), null);
  assert.equal(threadItemKind(thread("archived", { isUnread: true, isArchived: true })), null);
});

test("thread items come in the spec's order: questions longest waiting first, then failed, queued-failed, results", () => {
  const items = build([
    thread("result", { isUnread: true, updatedAt: 50 }),
    thread("queued", { indicator: "queued-failed", updatedAt: 40 }),
    thread("failed-old", { status: "error", updatedAt: 10 }),
    thread("failed-new", { status: "error", updatedAt: 30 }),
    thread("asked-late", { hasPendingInteraction: true }),
    thread("asked-early", { hasPendingInteraction: true }),
  ], {
    questions: new Map([["asked-late", { text: "Ship it?", since: 2_000 }], ["asked-early", { text: null, since: 1_000 }]]),
  });
  assert.deepEqual(items.map((item) => item.threadId), ["asked-early", "asked-late", "failed-new", "failed-old", "queued", "result"]);
  assert.deepEqual(items.map((item) => item.reason), [
    "Needs your input", "Ship it?", "Last turn failed", "Last turn failed", "A queued message failed to send", "Finished · review the result",
  ]);
});

test("a question without a time from bb waits since the client first saw it", () => {
  const items = build([thread("a", { hasPendingInteraction: true }), thread("b", { hasPendingInteraction: true })], {
    firstSeen: new Map([["a", 500], ["b", 100]]),
  });
  assert.deepEqual(items.map((item) => [item.threadId, item.since]), [["b", 100], ["a", 500]]);
  const seen = trackFirstSeen(new Map([["a", 500], ["gone", 1]]), ["a", "c"], 900);
  assert.deepEqual([...seen], [["a", 500], ["c", 900]]);
});

test("a subthread's item names its orchestration", () => {
  const [item] = build([thread("kid", { status: "error" })], { orchestrationOf: (id) => (id === "kid" ? "Orchestrate PR review" : null) });
  assert.equal(item?.orchestration, "Orchestrate PR review");
});

const interaction = (createdAt: number, payload: PendingInteraction["payload"], status = "pending"): PendingInteraction => ({ createdAt, status, payload });

test("the question text comes from the oldest pending request, in words for every kind", () => {
  assert.deepEqual(describeQuestion([]), { text: null, since: null });
  assert.deepEqual(
    describeQuestion([
      interaction(9, { kind: "user_question", questions: [{ prompt: "Later" }] }),
      interaction(3, { kind: "user_question", questions: [{ prompt: "Which branch?" }, { prompt: "And tag?" }] }),
      interaction(1, { kind: "user_question", questions: [{ prompt: "Answered" }] }, "resolved"),
    ]),
    { text: "Which branch? (+1 more)", since: 3 },
  );
  assert.equal(describeQuestion([interaction(1, { kind: "approval", subject: { kind: "command", command: "npm publish" } })]).text, "Approve: npm publish");
  assert.equal(describeQuestion([interaction(1, { kind: "approval", subject: { kind: "plan" } })]).text, "Approve the plan");
  assert.equal(describeQuestion([interaction(1, { kind: "approval", subject: { kind: "tool_use", presentation: { label: { pending: "Running deploy" } } } })]).text, "Approve: Running deploy");
  assert.equal(describeQuestion([interaction(1, { kind: "approval", subject: { kind: "brand-new" } })]).text, "Approve a request");
  assert.equal(describeQuestion([interaction(1, { kind: "plugin", title: "Pick a device" })]).text, "Pick a device");
});

const pr = (number: number, extra: Partial<ThreadPullRequest> = {}): ThreadPullRequest => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  state: "open",
  attention: "none",
  checks: { state: "passing" },
  ...extra,
});

test("linked PRs join the queue only when an agent can act: failing, conflicts, changes requested; never Ready", () => {
  const folder = new Map([
    ["https://github.com/o/r/pull/3", ["changes_requested"] as const],
    ["https://github.com/o/r/pull/4", ["ready"] as const],
  ]);
  const items = pullRequestItems("linked", [
    { threadId: "t1", pullRequests: [pr(3), pr(4), pr(5)] },
    { threadId: "t2", pullRequests: [pr(2, { attention: "conflicts" }), pr(1, { checks: { state: "failing" } }), pr(6, { state: "merged", checks: { state: "failing" } })] },
  ], folder, []);
  assert.deepEqual(items.map((item) => [item.number, item.threadId, item.reason]), [
    [1, "t2", "#1 · Checks failing"],
    [2, "t2", "#2 · Has conflicts"],
    [3, "t1", "#3 · Changes requested"],
  ]);
});

test("a PR linked from two threads is one item, owned by the first thread listed", () => {
  const failing = pr(7, { checks: { state: "failing" } });
  const items = pullRequestItems("linked", [{ threadId: "kid", pullRequests: [failing] }, { threadId: "parent", pullRequests: [failing] }], new Map(), []);
  assert.deepEqual(items.map((item) => item.threadId), ["kid"]);
});

const folderItem = (number: number, attention: GithubFolderItem["attention"]): GithubFolderItem => ({
  pr: { url: `https://github.com/o/r/pull/${number}`, number, title: `PR ${number}`, repo: "o/r", author: "me", isDraft: false, updatedAt: "" },
  attention,
  snoozeKey: `k${number}`,
});

test("the PR setting can switch to every GitHub Folder item, or to none", () => {
  const linked = [{ threadId: "t1", pullRequests: [pr(8, { checks: { state: "failing" } })] }];
  const folderItems = [folderItem(8, ["ci_failed"]), folderItem(9, ["review"])];
  assert.deepEqual(pullRequestItems("none", linked, new Map(), folderItems), []);
  const all = pullRequestItems("all", linked, new Map(), folderItems);
  assert.deepEqual(all.map((item) => [item.number, item.threadId, item.reason]), [[8, "t1", "#8 · Checks failing"], [9, null, "#9 · Review requested"]]);
});

const automation = (id: string, extra: Partial<AutomationSummary> = {}): AutomationSummary => ({
  id, projectId: "p", projectName: null, name: id, enabled: true, nextRunAt: null, lastRunAt: 0, lastRunStatus: "succeeded", lastRunThreadId: null, lastError: null, ...extra,
});

test("failed automations: enabled ones whose last run failed, most recent first, opening their last run", () => {
  const items = automationItems([
    automation("ok"),
    automation("old", { lastRunStatus: "failed", lastRunAt: 1 }),
    automation("new", { lastError: "timeout", lastRunAt: 5, lastRunThreadId: "thr_run" }),
    automation("paused", { enabled: false, lastRunStatus: "failed" }),
    automation("rerunning", { lastRunStatus: "running", lastError: "x" }),
  ]);
  assert.deepEqual(items.map((item) => [item.title, item.reason, item.threadId]), [
    ["new", "Last run failed: timeout", "thr_run"],
    ["old", "Last run failed", null],
  ]);
});

test("a snooze lasts until the item changes", () => {
  const [item] = build([thread("f", { status: "error", updatedAt: 10 })]);
  assert.ok(item);
  const snoozes = { [item.key]: item.signature };
  assert.equal(isSnoozed(item, snoozes), true);
  const [changed] = build([thread("f", { status: "error", updatedAt: 11 })]);
  assert.equal(isSnoozed(changed!, snoozes), false, "a new failure shows again");
  const [nowInput] = build([thread("f", { hasPendingInteraction: true, updatedAt: 10 })]);
  assert.equal(isSnoozed(nowInput!, snoozes), false, "a different reason shows again");
});

test("pruning drops snoozes of changed items, keeps those whose source hasn't loaded, and caps the store", () => {
  const [item] = build([thread("f", { status: "error", updatedAt: 11 })]);
  const pruned = pruneSnoozes({ "thread:f": "failed:10", "pr:x": "pr:failing", "thread:same": "x" }, [item!]);
  assert.deepEqual(pruned, { "pr:x": "pr:failing", "thread:same": "x" });
  const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`k${i}`, "s"]));
  assert.deepEqual(Object.keys(pruneSnoozes(many, [], 2)), ["k3", "k4"]);
  assert.deepEqual(readSnoozes({ a: "1", b: 2 }), { a: "1" });
  assert.deepEqual(readSnoozes(["a"]), {});
  assert.deepEqual(readSnoozes(null), {});
});

test("⇧⌘I opens the first item, then the one after the open thread, wrapping", () => {
  const items = build([thread("a", { status: "error", updatedAt: 3 }), thread("b", { status: "error", updatedAt: 2 }), thread("c", { status: "error", updatedAt: 1 })]);
  assert.equal(nextItem(items, null)?.threadId, "a");
  assert.equal(nextItem(items, "elsewhere")?.threadId, "a");
  assert.equal(nextItem(items, "a")?.threadId, "b");
  assert.equal(nextItem(items, "c")?.threadId, "a");
  assert.equal(nextItem([], "a"), null);
});
