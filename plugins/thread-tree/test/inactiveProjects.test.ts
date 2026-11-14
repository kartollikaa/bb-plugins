import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForest, type TreeThread } from "../src/tree.ts";
import { folderProjectOf, HOUR_MS, inactiveProjectIds, inactiveRule, type InactiveContext } from "../src/inactiveProjects.ts";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const STALE = NOW - 24 * HOUR_MS - 1;

function thread(id: string, projectId: string, over: Partial<TreeThread> = {}): TreeThread {
  return {
    id,
    projectId,
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
    createdAt: STALE,
    updatedAt: NOW,
    latestAttentionAt: STALE,
    ...over,
  };
}

const ctx = (over: Partial<InactiveContext> = {}): InactiveContext => ({ now: NOW, hideAfterHours: 24, activeThreadId: null, activeWasInactive: false, lastActivityAt: {}, ...over });

const inactive = (threads: TreeThread[], projects: string[], context = ctx()) => [...inactiveProjectIds(buildForest(threads), projects, context)].sort();

test("a folder quiet for longer than the window is inactive; one active within it is not", () => {
  assert.deepEqual(inactive([thread("a", "old"), thread("b", "fresh", { latestAttentionAt: NOW - HOUR_MS })], ["old", "fresh"]), ["old"]);
});

test("only longer than the window counts as inactive", () => {
  assert.deepEqual(inactive([thread("a", "p", { latestAttentionAt: NOW - 24 * HOUR_MS - 1 })], ["p"]), ["p"]);
  assert.deepEqual(inactive([thread("a", "p", { latestAttentionAt: NOW - 24 * HOUR_MS })], ["p"]), []);
});

test("activity keys on latestAttentionAt, so reading a thread (updatedAt) doesn't bring the folder back", () => {
  assert.deepEqual(inactive([thread("a", "p", { updatedAt: NOW })], ["p"]), ["p"]);
});

test("one recent subthread keeps the folder, even under a stale root", () => {
  assert.deepEqual(inactive([thread("root", "p"), thread("kid", "p", { parentThreadId: "root", latestAttentionAt: NOW - HOUR_MS })], ["p"]), []);
});

test("a subthread from another project counts for the folder its root is drawn in", () => {
  const threads = [thread("root", "a"), thread("kid", "b", { parentThreadId: "root", latestAttentionAt: NOW - HOUR_MS })];
  assert.deepEqual(inactive(threads, ["a", "b"]), ["b"]);
});

test("running, waiting, asking or failed threads keep a stale folder visible", () => {
  for (const over of [{ status: "active" }, { indicator: "queued-waiting" }, { hasPendingInteraction: true }, { status: "error" }, { activity: { backgroundAgents: 0, backgroundCommands: 1, workflows: 0 } }] as Partial<TreeThread>[]) {
    assert.deepEqual(inactive([thread("root", "p"), thread("kid", "p", { parentThreadId: "root", ...over })], ["p"]), [], JSON.stringify(over));
  }
});

test("a finished but unread thread doesn't keep a stale folder: Needs you lists it", () => {
  assert.deepEqual(inactive([thread("a", "p", { isUnread: true })], ["p"]), ["p"]);
});

test("a pinned thread of the project keeps its folder", () => {
  assert.deepEqual(inactive([thread("a", "p"), thread("pin", "p", { isPinned: true })], ["p"]), []);
});

test("an empty retained folder is inactive", () => {
  assert.deepEqual(inactive([], ["empty"]), ["empty"]);
});

test("0 hours turns hiding off", () => {
  assert.deepEqual(inactive([thread("a", "p")], ["p"], ctx({ hideAfterHours: 0 })), []);
});

test("the custom window applies", () => {
  const threads = [thread("a", "p", { latestAttentionAt: NOW - 3 * HOUR_MS })];
  assert.deepEqual(inactive(threads, ["p"], ctx({ hideAfterHours: 2 })), ["p"]);
  assert.deepEqual(inactive(threads, ["p"], ctx({ hideAfterHours: 4 })), []);
});

test("the open thread's folder stays out unless it was opened from the expanded fold", () => {
  const threads = [thread("root", "p"), thread("kid", "p", { parentThreadId: "root" })];
  assert.deepEqual(inactive(threads, ["p"], ctx({ activeThreadId: "kid" })), []);
  assert.deepEqual(inactive(threads, ["p"], ctx({ activeThreadId: "kid", activeWasInactive: true })), ["p"]);
});

test("a thread's folder is its display root's project; a pinned tree has none", () => {
  const forest = buildForest([thread("root", "a"), thread("kid", "b", { parentThreadId: "root" }), thread("pin", "c", { isPinned: true })]);
  assert.equal(folderProjectOf(forest, "kid"), "a");
  assert.equal(folderProjectOf(forest, "root"), "a");
  assert.equal(folderProjectOf(forest, "pin"), null);
  assert.equal(folderProjectOf(forest, null), null);
  assert.equal(folderProjectOf(forest, "missing"), null);
});

test("all archived but one old thread left: the archived threads' recent turns keep the folder", () => {
  const threads = [thread("left", "p", { latestAttentionAt: NOW - 25 * HOUR_MS })];
  assert.deepEqual(inactive(threads, ["p"]), ["p"]);
  assert.deepEqual(inactive(threads, ["p"], ctx({ lastActivityAt: { p: NOW - HOUR_MS } })), []);
});

test("work only in subthreads keeps the folder though no thread's latestAttentionAt moved", () => {
  const threads = [thread("root", "p"), thread("kid", "p", { parentThreadId: "root" })];
  assert.deepEqual(inactive(threads, ["p"], ctx({ lastActivityAt: { p: NOW - 2 * HOUR_MS } })), []);
  assert.deepEqual(inactive(threads, ["p"], ctx({ lastActivityAt: { p: STALE } })), ["p"]);
});

test("the rule names the window", () => {
  assert.match(inactiveRule(24), /over 24 hours/);
  assert.match(inactiveRule(1), /over an hour/);
});
