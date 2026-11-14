import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForest, groupRows, type TreeThread } from "../src/tree.ts";
import { isOlderRoot, OLDER_AFTER_MS, olderRootIds, sameIds, type OlderContext } from "../src/olderThreads.ts";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const OLD = NOW - OLDER_AFTER_MS - 1;

function thread(id: string, over: Partial<TreeThread> = {}): TreeThread {
  return {
    id,
    projectId: "p",
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
    isUnread: false,
    activity: { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 },
    createdAt: OLD,
    updatedAt: OLD,
    ...over,
    latestAttentionAt: over.latestAttentionAt ?? over.updatedAt ?? OLD,
  };
}

function context(over: Partial<OlderContext<TreeThread>> = {}): OlderContext<TreeThread> {
  return { now: NOW, activeThreadId: null, draftIds: new Set(), pullRequestStates: () => [], ...over };
}

const older = (threads: TreeThread[], ctx = context()) => {
  const forest = buildForest(threads);
  return [...olderRootIds(forest, ctx)].sort();
};

test("an idle, read root untouched for over a day folds", () => {
  assert.deepEqual(older([thread("a")]), ["a"]);
});

test("a day or less since the last update keeps the root out", () => {
  assert.deepEqual(older([thread("a", { updatedAt: NOW - OLDER_AFTER_MS })]), []);
});

test("unread, running, waiting, failed or asking roots stay out", () => {
  assert.deepEqual(older([
    thread("unread", { isUnread: true }),
    thread("running", { status: "active" }),
    thread("waiting", { indicator: "queued-waiting" }),
    thread("failed", { status: "error" }),
    thread("asking", { hasPendingInteraction: true }),
    thread("quiet"),
  ]), ["quiet"]);
});

test("a draft, the open thread and a pinned root stay out", () => {
  assert.deepEqual(older([thread("draft"), thread("open"), thread("pinned", { isPinned: true }), thread("quiet")], context({ draftIds: new Set(["draft"]), activeThreadId: "open" })), ["quiet"]);
});

test("only merged, closed or no PRs let a root fold", () => {
  const states: Record<string, string[]> = { merged: ["merged", "closed"], open: ["merged", "open"], draft: ["draft"], unknown: ["unknown"] };
  assert.deepEqual(older(Object.keys(states).map((id) => thread(id)), context({ pullRequestStates: (each) => states[each.id] ?? [] })), ["merged"]);
});

test("a thread whose PR state isn't known yet stays out, and so does its root", () => {
  assert.deepEqual(older([thread("unknown"), thread("kid-unknown"), thread("kid", { parentThreadId: "kid-unknown" }), thread("known")], context({ pullRequestStates: (each) => (each.id === "unknown" || each.id === "kid" ? null : []) })), ["known"]);
});

test("a root folds only when its whole subtree is quiet and old too", () => {
  const threads = [
    thread("calm"),
    thread("calm-kid", { parentThreadId: "calm" }),
    thread("busy"),
    thread("busy-kid", { parentThreadId: "busy", isUnread: true }),
    thread("fresh"),
    thread("fresh-kid", { parentThreadId: "fresh", updatedAt: NOW - 1000 }),
    thread("pr"),
    thread("pr-kid", { parentThreadId: "pr" }),
    thread("holds-open"),
    thread("open-kid", { parentThreadId: "holds-open" }),
  ];
  const ctx = context({ activeThreadId: "open-kid", pullRequestStates: (each) => (each.id === "pr-kid" ? ["open"] : []) });
  assert.deepEqual(older(threads, ctx), ["calm"]);
});

test("project folders split older roots off their rows; pinned and other modes don't", () => {
  const threads = [
    thread("old"),
    thread("old-kid", { parentThreadId: "old" }),
    thread("new", { updatedAt: NOW }),
    thread("pinned", { isPinned: true }),
  ];
  const forest = buildForest(threads);
  const isOlder = (root: TreeThread) => isOlderRoot(forest, root, context());
  const groups = groupRows(forest, new Set(), "project", null, null, {}, "activity", [], isOlder);
  const project = groups.find((group) => group.key === "project:p")!;
  assert.deepEqual(project.rows.map((row) => row.thread.id), ["new"]);
  assert.deepEqual(project.older?.rows.map((row) => row.thread.id), ["old", "old-kid"]);
  assert.equal(project.older?.rootCount, 1);
  assert.equal(project.rootCount, 2);
  assert.equal(groups.find((group) => group.key === "pinned")!.older, null);
  const flat = groupRows(forest, new Set(), "none", null, null, {}, "activity", [], isOlder);
  assert.equal(flat[1]!.older, null);
  assert.equal(flat[1]!.rows.length, 3);
});

test("a folder with nothing older has no older line", () => {
  const forest = buildForest([thread("new", { updatedAt: NOW })]);
  const [group] = groupRows(forest, new Set(), "project", null, null, {}, "activity", [], () => false);
  assert.equal(group!.older, null);
});

test("two id sets are the same only with the same members", () => {
  assert.equal(sameIds(new Set(["a", "b"]), new Set(["b", "a"])), true);
  assert.equal(sameIds(new Set(["a"]), new Set(["a", "b"])), false);
  assert.equal(sameIds(new Set(["a", "c"]), new Set(["a", "b"])), false);
});
