import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForest, groupRows, type TreeThread } from "../src/tree.ts";
import {
  archivePlan,
  orchestrationTreeIds,
  holdForHiddenChanges,
  unlistedDescendantIds,
  dirtyEnvironmentIds,
  foldBarSegments,
  isFinishedFold,
  orchestrationSubtitle,
  orchestrations,
  rollupOver,
} from "../src/orchestrations.ts";

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
  updatedAt: 0,
  ...extra,
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

test("Orchestrations lists roots with subthreads that still have work going, with their progress", () => {
  const threads = [
    thread("live", { updatedAt: 9, projectId: "bb" }),
    thread("l1", { parentThreadId: "live", ...input }),
    thread("l2", { parentThreadId: "live", projectId: "web", ...running }),
    thread("l3", { parentThreadId: "live" }),
    thread("l4", { parentThreadId: "l3", ...unread }),
    thread("l5", { parentThreadId: "live", ...failed }),
    thread("finished", { updatedAt: 8 }),
    thread("f1", { parentThreadId: "finished" }),
    thread("unreadOnly", { updatedAt: 7 }),
    thread("u1", { parentThreadId: "unreadOnly", ...unread }),
    thread("selfRunning", { updatedAt: 6, ...running }),
    thread("s1", { parentThreadId: "selfRunning" }),
    thread("lone", { updatedAt: 10, ...running }),
  ];
  const list = orchestrations(buildForest(threads));
  assert.deepEqual(list.map((o) => o.thread.id), ["live", "unreadOnly", "selfRunning"]);
  const [live, unreadOnly] = list;
  assert.deepEqual(
    { state: live!.state, projectIds: live!.projectIds, total: live!.total, done: live!.done, needsYou: live!.needsYou, failed: live!.failed, running: live!.running },
    { state: "input", projectIds: ["bb", "p1", "web"], total: 5, done: 2, needsYou: 1, failed: 1, running: 1 },
  );
  assert.equal(unreadOnly!.state, "unread");
  assert.equal(orchestrationSubtitle(live!, (id) => ({ bb: "bb-plugins", web: "web" })[id] ?? null), "bb-plugins + web · 2/5 done · 1 needs you · 1 failed · 1 running");
  assert.equal(orchestrationSubtitle(unreadOnly!, () => "bb-plugins"), "bb-plugins · 1/1 done");
});

test("a waiting subthread keeps its orchestration in the section", () => {
  const threads = [thread("root"), thread("k", { parentThreadId: "root", indicator: "queued-waiting" })];
  assert.deepEqual(orchestrations(buildForest(threads)).map((o) => o.state), ["waiting"]);
});

test("revealing an orchestration covers its whole tree, nested subthreads included", () => {
  const forest = buildForest([thread("root"), thread("a", { parentThreadId: "root" }), thread("a1", { parentThreadId: "a" }), thread("other")]);
  assert.deepEqual(orchestrationTreeIds(forest, "root").sort(), ["a", "a1", "root"]);
});

test("archiving a finished fold goes leaves first and keeps dirty threads and their ancestors", () => {
  const threads = [
    thread("root"),
    thread("a", { parentThreadId: "root" }),
    thread("a1", { parentThreadId: "a" }),
    thread("b", { parentThreadId: "root" }),
    thread("b1", { parentThreadId: "b" }),
  ];
  const forest = buildForest(threads);
  const clean = archivePlan(forest, "root", new Set());
  assert.deepEqual(clean.skipped, []);
  assert.deepEqual(clean.kept, []);
  assert.equal(clean.archive.at(-1), "root");
  assert.ok(clean.archive.indexOf("a1") < clean.archive.indexOf("a"));
  assert.ok(clean.archive.indexOf("b1") < clean.archive.indexOf("b"));
  assert.equal(clean.archive.length, 5);

  const dirty = archivePlan(forest, "root", new Set(["a1"]));
  assert.deepEqual(dirty.skipped, ["a1"]);
  assert.deepEqual(dirty.kept.sort(), ["a", "root"]);
  assert.deepEqual(dirty.archive, ["b1", "b"]);
});

test("threads below the archive list that the sidebar didn't show are found for a worktree check", () => {
  const descendants = new Map([["a1", ["h1"]], ["a", ["a1", "h1"]], ["b", []], ["root", ["a", "a1", "h1", "b", "h2"]]]);
  assert.deepEqual(unlistedDescendantIds(["a1", "a", "b", "root"], descendants).sort(), ["h1", "h2"]);
});

test("a hidden subthread with changes holds back every listed thread above it", () => {
  const order = ["a1", "a", "b", "root"];
  const descendants = new Map([["a1", ["h1"]], ["a", ["a1", "h1"]], ["b", []], ["root", ["a", "a1", "h1", "b"]]]);
  assert.deepEqual(holdForHiddenChanges(order, descendants, new Set()), { archive: order, held: [], skipped: [] });
  assert.deepEqual(holdForHiddenChanges(order, descendants, new Set(["h1"])), { archive: ["b"], held: ["a1", "a", "root"], skipped: ["h1"] });
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
