import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForest, groupRows, type TreeThread } from "../src/tree.ts";
import {
  archiveScopes,
  foldArchivePlan,
  orchestrationTreeIds,
  dirtyEnvironmentIds,
  foldBarSegments,
  isFinishedFold,
  orchestrationSubtitleParts,
  orchestrations,
  rollupOver,
} from "../src/orchestrations.ts";

/** Every fixture reads as just opened, so code keyed on `updatedAt` instead of bb's activity time fails. */
const JUST_READ = 1e12;

const thread = (id: string, extra: Partial<TreeThread> = {}): TreeThread => ({
  id,
  projectId: "p1",
  parentThreadId: null,
  lifecycleOwnerThreadId: null,
  isPinned: false,
  pinSortKey: null,
  pinnedAt: null,
  isHidden: false,
  isArchived: false,
  status: "idle",
  indicator: "none",
  hasPendingInteraction: false,
  activity: { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 },
  createdAt: 0,
  updatedAt: JUST_READ,
  ...extra,
  latestAttentionAt: extra.latestAttentionAt ?? 0,
});
const running = { status: "active" };
const input = { hasPendingInteraction: true };
const failed = { status: "error" };
const unread = { isUnread: true };

test("a folded parent counts finished-unread subthreads apart from read ones", () => {
  const threads = [thread("root"), thread("a", { parentThreadId: "root", ...unread }), thread("b", { parentThreadId: "root" })];
  const [group] = groupRows(buildForest(threads), new Set(["root"]));
  assert.deepEqual(group!.rows[0]!.foldCounts, { unread: 1, done: 1 });
});

test("the rollup replaces the parent's glyph only when the subtree is more urgent", () => {
  assert.equal(rollupOver("done", { input: 1, done: 3 }), "input");
  assert.equal(rollupOver("done", { unread: 1 }), "unread");
  assert.equal(rollupOver("running", { running: 2, error: 1 }), "error");
  assert.equal(rollupOver("input", { error: 1 }), null);
  assert.equal(rollupOver("running", { running: 1 }), null, "equal urgency keeps the thread's own glyph");
  assert.equal(rollupOver("unread", { waiting: 1 }), "waiting");
  assert.equal(rollupOver("done", { done: 4 }), null);
});

test("a fold is finished when the parent and every subthread are done and read", () => {
  assert.equal(isFinishedFold("done", { done: 5 }), true);
  assert.equal(isFinishedFold("unread", { done: 5 }), false);
  assert.equal(isFinishedFold("done", { done: 4, unread: 1 }), false);
  assert.equal(isFinishedFold("done", { done: 4, waiting: 1 }), false);
  assert.equal(isFinishedFold("done", {}), false);
});

test("the fold bar shows only from five subthreads, segments sized by state, most urgent first", () => {
  assert.deepEqual(foldBarSegments({ running: 2, done: 2 }, 4), []);
  assert.deepEqual(foldBarSegments({ done: 3, input: 1, running: 1 }, 5), [
    { state: "input", fraction: 0.2 },
    { state: "running", fraction: 0.2 },
    { state: "done", fraction: 0.6 },
  ]);
});

test("Orchestrations lists every root with subthreads, most urgent first, with their progress", () => {
  const threads = [
    thread("live", { latestAttentionAt: 9, projectId: "bb" }),
    thread("l1", { parentThreadId: "live", ...input }),
    thread("l2", { parentThreadId: "live", projectId: "web", ...running }),
    thread("l3", { parentThreadId: "live" }),
    thread("l4", { parentThreadId: "l3", ...unread }),
    thread("l5", { parentThreadId: "live", ...failed }),
    thread("finished", { latestAttentionAt: 7 }),
    thread("f1", { parentThreadId: "finished" }),
    thread("unreadOnly", { latestAttentionAt: 8 }),
    thread("u1", { parentThreadId: "unreadOnly", ...unread }),
    thread("selfRunning", { latestAttentionAt: 6, ...running }),
    thread("s1", { parentThreadId: "selfRunning" }),
    thread("lone", { latestAttentionAt: 10, ...running }),
  ];
  const list = orchestrations(buildForest(threads));
  assert.deepEqual(list.map((o) => o.thread.id), ["live", "selfRunning", "unreadOnly", "finished"]);
  const [live, , unreadOnly] = list;
  assert.deepEqual(
    { state: live!.state, projectIds: live!.projectIds, total: live!.total, done: live!.done, needsYou: live!.needsYou, failed: live!.failed, running: live!.running },
    { state: "input", projectIds: ["bb", "p1", "web"], total: 5, done: 2, needsYou: 1, failed: 1, running: 1 },
  );
  assert.equal(unreadOnly!.state, "unread");
  assert.deepEqual(list.map((o) => o.rollup), ["input", null, "unread", null]);
  assert.deepEqual(list.map((o) => o.finished), [false, false, false, true]);
  assert.equal(subtitle(live!, (id) => ({ bb: "bb-plugins", web: "web" })[id] ?? null), "bb-plugins + web · 2/5 done · 1 needs you · 1 failed · 1 running");
  assert.equal(subtitle(unreadOnly!, () => "bb-plugins"), "bb-plugins · 1/1 done");
  assert.deepEqual(
    orchestrationSubtitleParts(live!, (id) => ({ bb: "bb-plugins", web: "web" })[id] ?? null).map((part) => part.tone),
    ["muted", "muted", "attention", "bad", "muted"],
  );
});

test("an idle, read orchestrator stays listed as finished", () => {
  const threads = [thread("orch"), thread("k1", { parentThreadId: "orch" }), thread("k2", { parentThreadId: "k1" })];
  const [entry, ...rest] = orchestrations(buildForest(threads));
  assert.equal(rest.length, 0);
  assert.deepEqual({ id: entry!.thread.id, state: entry!.state, finished: entry!.finished, total: entry!.total }, { id: "orch", state: "done", finished: true, total: 2 });
});

test("an orchestrator leaves the list once it or its last subthread is archived", () => {
  const allKidsArchived = [thread("a"), thread("a1", { parentThreadId: "a", isArchived: true }), thread("a2", { parentThreadId: "a1", isArchived: true })];
  const rootArchived = [thread("b", { isArchived: true }), thread("b1", { parentThreadId: "b" })];
  const oneLeft = [thread("c"), thread("c1", { parentThreadId: "c", isArchived: true }), thread("c2", { parentThreadId: "c", ...running })];
  assert.deepEqual(orchestrations(buildForest([...allKidsArchived, ...rootArchived, ...oneLeft])).map((o) => [o.thread.id, o.total]), [["c", 1]]);
});

test("same urgency sorts by the tree's latest activity, finished ones always last", () => {
  const threads = [
    thread("doneRecent", { latestAttentionAt: 100 }),
    thread("d1", { parentThreadId: "doneRecent" }),
    thread("old", { latestAttentionAt: 1 }),
    thread("o1", { parentThreadId: "old", latestAttentionAt: 50, ...running }),
    thread("new", { latestAttentionAt: 20 }),
    thread("n1", { parentThreadId: "new", ...running }),
  ];
  assert.deepEqual(orchestrations(buildForest(threads)).map((o) => o.thread.id), ["old", "new", "doneRecent"]);
});

const subtitle = (...args: Parameters<typeof orchestrationSubtitleParts>) => orchestrationSubtitleParts(...args).map((part) => part.text).join(" · ");

test("a waiting subthread keeps its orchestration in the section", () => {
  const threads = [thread("root"), thread("k", { parentThreadId: "root", indicator: "queued-waiting" })];
  assert.deepEqual(orchestrations(buildForest(threads)).map((o) => o.state), ["waiting"]);
});

test("an orchestration's tree covers nested subthreads too", () => {
  const forest = buildForest([thread("root"), thread("a", { parentThreadId: "root" }), thread("a1", { parentThreadId: "a" }), thread("other")]);
  assert.deepEqual(orchestrationTreeIds(forest, "root").sort(), ["a", "a1", "root"]);
});

const archiveTree = () => buildForest([
  thread("root"),
  thread("a", { parentThreadId: "root" }),
  thread("a1", { parentThreadId: "a" }),
  thread("b", { parentThreadId: "root" }),
  thread("b1", { parentThreadId: "b" }),
]);
// What archiving each visible thread takes along, per bb: its cascade plus hidden descendants (h1 under a1, h2 under root).
const scopes = new Map([
  ["root", ["root", "a", "a1", "h1", "b", "b1", "h2"]],
  ["a", ["a", "a1", "h1"]],
  ["a1", ["a1", "h1"]],
  ["b", ["b", "b1"]],
  ["b1", ["b1"]],
]);

test("a clean fold is archived through its root alone, counting the hidden threads it takes along", () => {
  assert.deepEqual(foldArchivePlan(archiveTree(), ["root"], scopes, new Set()), { roots: ["root"], archiveCount: 7, skipped: 0, kept: 0 });
});

test("a dirty thread, hidden or not, keeps every thread whose archive would take it along", () => {
  assert.deepEqual(foldArchivePlan(archiveTree(), ["root"], scopes, new Set(["h1"])), { roots: ["b"], archiveCount: 2, skipped: 1, kept: 4 });
  assert.deepEqual(foldArchivePlan(archiveTree(), ["root"], scopes, new Set(["b1"])), { roots: ["a"], archiveCount: 3, skipped: 1, kept: 3 });
});

test("a dirty root still lets its clean subtrees go; a hidden thread left behind counts as kept", () => {
  assert.deepEqual(foldArchivePlan(archiveTree(), ["root"], scopes, new Set(["root"])), { roots: ["a", "b"], archiveCount: 5, skipped: 1, kept: 1 });
});

test("several roots plan together: each clean one goes, a dirty one stays and counts once", () => {
  const forest = buildForest([thread("x"), thread("y"), thread("y1", { parentThreadId: "y" })]);
  const twoRoots = new Map([["x", ["x"]], ["y", ["y", "y1"]], ["y1", ["y1"]]]);
  assert.deepEqual(foldArchivePlan(forest, ["x", "y"], twoRoots, new Set(["y1"])), { roots: ["x"], archiveCount: 1, skipped: 1, kept: 1 });
});

test("a root another root's archive already takes along is not archived again", () => {
  const forest = buildForest([thread("x"), thread("y")]);
  const shared = new Map([["x", ["x", "y"]], ["y", ["y"]]]);
  assert.deepEqual(foldArchivePlan(forest, ["x", "y"], shared, new Set()), { roots: ["x"], archiveCount: 2, skipped: 0, kept: 0 });
  assert.deepEqual(foldArchivePlan(forest, ["y", "x"], shared, new Set()), { roots: ["x"], archiveCount: 2, skipped: 0, kept: 0 });
  const mutual = new Map([["x", ["x", "y"]], ["y", ["y", "x"]]]);
  assert.deepEqual(foldArchivePlan(forest, ["y", "x"], mutual, new Set()).roots, ["y"]);
});

test("a thread missing from the scope check counts as unsafe", () => {
  const partial = new Map([...scopes].filter(([id]) => id !== "b"));
  assert.deepEqual(foldArchivePlan(archiveTree(), ["root"], partial, new Set(["h1"])).roots, ["b1"]);
});

test("a worktree counts as dirty when it has changes or untracked files, or its status can't be read", () => {
  const available = (hasUncommittedChanges: boolean, state: string) => ({ outcome: "available", workspace: { workingTree: { hasUncommittedChanges, state } } });
  const statuses = {
    clean: available(false, "clean"),
    committed: available(false, "committed_unmerged"),
    changed: available(true, "dirty_uncommitted"),
    untracked: available(false, "untracked"),
    gone: { outcome: "unavailable", failure: { code: "path_not_found" } },
    denied: { outcome: "unavailable", failure: { code: "permission_denied" } },
    broken: { outcome: "failed", message: "x" },
    plain: { outcome: "not_applicable", reason: "non_git_environment" },
  };
  assert.deepEqual(dirtyEnvironmentIds([...Object.keys(statuses), "missing"], statuses).sort(), ["broken", "changed", "denied", "missing", "untracked"]);
});

test("every asked thread gets an archive scope, a leaf with nothing below it too", () => {
  const scopes = archiveScopes(
    ["root", "leaf"],
    [{ threadId: "root", cascadeThreadIds: ["owned"] }],
    [{ threadId: "root", descendantIds: ["kid", "owned"] }, { threadId: "leaf", descendantIds: [] }],
  );
  assert.deepEqual(scopes, { root: ["root", "owned", "kid"], leaf: ["leaf"] });
});

test("opening an orchestration keeps its place: reading bumps updatedAt and clears unread, neither moves it", () => {
  const tree = (readA: boolean) => [
    thread("a", { latestAttentionAt: 5, updatedAt: readA ? 100 : 5 }),
    thread("a1", { parentThreadId: "a", isUnread: !readA }),
    thread("b", { latestAttentionAt: 9, updatedAt: 9 }),
    thread("b1", { parentThreadId: "b" }),
    thread("c", { latestAttentionAt: 1, updatedAt: 1 }),
    thread("c1", { parentThreadId: "c", isUnread: true }),
  ];
  const order = (readA: boolean) => orchestrations(buildForest(tree(readA))).map((o) => o.thread.id);
  assert.deepEqual(order(false), ["b", "a", "c"]);
  assert.deepEqual(order(true), ["b", "a", "c"]);
});
