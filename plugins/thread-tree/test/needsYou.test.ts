import { test } from "node:test";
import assert from "node:assert/strict";
import {
  automationItems,
  cursorThreadId,
  describeQuestion,
  failedQueuedMessage,
  isSnoozed,
  itemTarget,
  linkedPullRequests,
  nextItem,
  pruneSnoozes,
  pullRequestItems,
  pullRequestSourcesSettled,
  questionsToRead,
  readSnoozes,
  threadItemKind,
  threadItems,
  trackFirstSeen,
  type NeedsYouThread,
  type PendingInteraction,
} from "../src/needsYou.ts";
import { openNextInboxItem, setInboxHandler } from "../src/inbox.ts";
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
  assert.deepEqual(Object.keys(pruneSnoozes(many, [], { limit: 2 })), ["k3", "k4"]);
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

test("a click opens the item's thread, else the PR page, else the Automations page", () => {
  const [failed] = build([thread("f", { status: "error" })]);
  assert.deepEqual(itemTarget(failed!), { kind: "thread", threadId: "f" });
  const [linkedPr, folderOnly] = pullRequestItems("all", [{ threadId: "t1", pullRequests: [pr(8)] }], new Map(), [folderItem(8, ["ci_failed"]), folderItem(9, ["review"])]);
  assert.deepEqual(itemTarget(linkedPr!), { kind: "thread", threadId: "t1" });
  assert.deepEqual(itemTarget(folderOnly!), { kind: "pr", url: folderOnly!.url });
  const [never] = automationItems([automation("a", { lastRunStatus: "failed" })]);
  assert.deepEqual(itemTarget(never!), { kind: "automations" });
});

test("a thread's own PRs leave out the ones its subthreads link", () => {
  const prs: Record<string, ThreadPullRequest[]> = { root: [pr(1), pr(2)], child: [pr(2)] };
  const linked = linkedPullRequests(["root", "child"], (id) => prs[id] ?? [], (id) => (id === "root" ? ["child"] : []));
  assert.deepEqual(linked.map(({ threadId, pullRequests }) => [threadId, pullRequests.map((entry) => entry.number)]), [["root", [1]], ["child", [2]]]);
});

test("⇧⌘I reaches the mounted sidebar, and an old sidebar unmounting doesn't drop a newer one", () => {
  assert.equal(openNextInboxItem(null), false);
  const calls: (string | null)[] = [];
  const dropOld = setInboxHandler(() => { calls.push("old"); return true; });
  const dropNew = setInboxHandler((threadId) => { calls.push(threadId); return true; });
  dropOld();
  assert.equal(openNextInboxItem("t1"), true);
  assert.deepEqual(calls, ["t1"]);
  dropNew();
  assert.equal(openNextInboxItem("t1"), false);
});

test("Resend picks the oldest failed queued message, retrying or exhausted", () => {
  const rows = [
    { id: "q0", state: "queued", createdAt: 0 },
    { id: "q2", state: "failed_exhausted", createdAt: 2 },
    { id: "q1", state: "failed_retrying", createdAt: 1 },
  ];
  assert.equal(failedQueuedMessage(rows)?.id, "q1");
  assert.equal(failedQueuedMessage([{ id: "q", state: "waiting", createdAt: 0 }]), null);
});

test("⇧⌘I steps past every item of the open thread, and from the last opened item when it has no thread or left the queue", () => {
  const prs = pullRequestItems("linked", [{ threadId: "a", pullRequests: [pr(1, { checks: { state: "failing" } }), pr(2, { checks: { state: "failing" } })] }], new Map(), []);
  const [question] = build([thread("b", { hasPendingInteraction: true })]);
  const queue = [...prs, question!];
  assert.equal(nextItem(queue, "a")?.threadId, "b", "both of a's PRs are skipped");
  const folder = pullRequestItems("all", [], new Map(), [folderItem(8, ["review"]), folderItem(9, ["review"])]);
  const opened = folder[0]!;
  assert.equal(nextItem(folder, null, { key: opened.key, index: 0, threadId: null })?.key, folder[1]!.key, "a PR page has no thread, the cursor knows where it was");
  const unread = build([thread("u1", { isUnread: true, updatedAt: 2 }), thread("u2", { isUnread: true, updatedAt: 1 })]);
  const afterRead = unread.slice(1);
  assert.equal(nextItem(afterRead, "u1", { key: unread[0]!.key, index: 0, threadId: "u1" })?.threadId, "u2", "the read result left; the next one took its place");
  assert.equal(nextItem(unread, "elsewhere", { key: unread[0]!.key, index: 0, threadId: "u1" })?.threadId, "u1", "navigating away drops the cursor");
});

test("with two sidebars mounted, unmounting the newer one hands ⇧⌘I back to the older", () => {
  const calls: string[] = [];
  const dropOld = setInboxHandler(() => { calls.push("old"); return true; });
  const dropNew = setInboxHandler(() => { calls.push("new"); return true; });
  dropNew();
  assert.equal(openNextInboxItem(null), true);
  assert.deepEqual(calls, ["old"]);
  dropOld();
});

test("only a thread whose turn failed offers Retry; an unread failure that has moved on doesn't", () => {
  const [errored, unreadError] = build([thread("e", { status: "error", updatedAt: 2 }), thread("u", { status: "idle", indicator: "unread-error", updatedAt: 1 })]);
  assert.equal(errored!.kind === "failed" && errored!.canRetry, true);
  assert.equal(unreadError!.kind === "failed" && unreadError!.canRetry, false);
});

test("questions are read again only for waiting threads that changed since the last read", () => {
  const read = new Map([["a", 1], ["b", 1], ["gone", 1]]);
  assert.deepEqual(questionsToRead([{ id: "a", updatedAt: 1 }, { id: "b", updatedAt: 2 }, { id: "c", updatedAt: 1 }], read), ["b", "c"]);
});

test("⇧⌘I from its cursor steps past the other items of the thread it opened", () => {
  const prs = pullRequestItems("linked", [{ threadId: "a", pullRequests: [pr(1, { checks: { state: "failing" } }), pr(2, { checks: { state: "failing" } })] }], new Map(), []);
  const [question] = build([thread("b", { status: "error" })]);
  const items = [...prs, question!];
  assert.equal(nextItem(items, "a", { key: prs[0]!.key, index: 0, threadId: "a" })?.threadId, "b");
  const lone = [prs[0]!];
  assert.equal(nextItem(lone, "a", { key: prs[0]!.key, index: 0, threadId: "a" }), null, "nothing else needs you");
  assert.equal(nextItem(prs, "a"), null, "every item is the open thread's");
  const folderOnly = pullRequestItems("all", [], new Map(), [folderItem(8, ["ci_failed"]), folderItem(9, ["review"])]);
  assert.equal(nextItem(folderOnly, null, { key: folderOnly[0]!.key, index: 0, threadId: null })?.key, folderOnly[1]!.key, "thread-less items still step one by one");
});

test("a PR's snooze survives switching the PR setting between linked and all", () => {
  const folder = new Map([["https://github.com/o/r/pull/8", ["ci_failed", "review"] as const]]);
  const linked = [{ threadId: "t1", pullRequests: [pr(8, { checks: { state: "failing" } })] }];
  const [inLinked] = pullRequestItems("linked", linked, folder, []);
  const [inAll] = pullRequestItems("all", linked, folder, [folderItem(8, ["review", "ci_failed"])]);
  assert.equal(inAll!.signature, inLinked!.signature);
  const [fixed] = pullRequestItems("all", [{ threadId: "t1", pullRequests: [pr(8)] }], folder, [folderItem(8, ["review", "ci_failed"])]);
  assert.notEqual(fixed!.signature, inAll!.signature, "the PR's own checks still count");
});

test("linked PRs skip threads with none, without walking their subthreads", () => {
  const walked: string[] = [];
  const linked = linkedPullRequests(["root", "bare"], (id) => (id === "root" ? [pr(1)] : []), (id) => { walked.push(id); return []; });
  assert.deepEqual(linked.map((entry) => entry.threadId), ["root"]);
  assert.deepEqual(walked, ["root"]);
});

test("a snoozed PR stays hidden and keeps its snooze while its PR sources are half loaded", () => {
  const folder = new Map([["https://github.com/o/r/pull/8", ["changes_requested"] as const]]);
  const failing = pr(8, { checks: { state: "failing" } });
  const [full] = pullRequestItems("linked", [{ threadId: "t1", pullRequests: [failing] }], folder, []);
  const snoozes = { [full!.key]: full!.signature };
  const [half] = pullRequestItems("linked", [{ threadId: "t1", pullRequests: [failing] }], new Map(), []);
  assert.notEqual(half!.signature, full!.signature);
  const loading = (item: { kind: string }) => item.kind !== "pr";
  assert.equal(isSnoozed(half!, snoozes, loading), true);
  assert.deepEqual(pruneSnoozes(snoozes, [half!], { settled: loading }), snoozes);
  assert.equal(isSnoozed(half!, snoozes), false, "once loaded, a real change shows the PR again");
  assert.deepEqual(pruneSnoozes(snoozes, [half!]), {});
});

test("PR sources count as settled only once the thread list has loaded too", () => {
  assert.equal(pullRequestSourcesSettled({ threadsStatus: "loading", folderLoaded: true, pullRequestsLoading: false }), false);
  assert.equal(pullRequestSourcesSettled({ threadsStatus: "error", folderLoaded: true, pullRequestsLoading: false }), false);
  assert.equal(pullRequestSourcesSettled({ threadsStatus: "ready", folderLoaded: false, pullRequestsLoading: false }), false);
  assert.equal(pullRequestSourcesSettled({ threadsStatus: "ready", folderLoaded: true, pullRequestsLoading: true }), false);
  assert.equal(pullRequestSourcesSettled({ threadsStatus: "ready", folderLoaded: true, pullRequestsLoading: false }), true);
});

test("⇧⌘I's cursor keeps the thread in view when a PR opens in a new tab", () => {
  assert.equal(cursorThreadId({ kind: "thread", threadId: "t2" }, "t1"), "t2");
  assert.equal(cursorThreadId({ kind: "pr", url: "https://github.com/o/r/pull/1" }, "t1"), null);
  assert.equal(cursorThreadId({ kind: "pr", url: "https://git.example.com/o/r/pull/1" }, "t1"), "t1");
  assert.equal(cursorThreadId({ kind: "automations" }, "t1"), null);
});
