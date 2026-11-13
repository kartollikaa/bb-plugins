import { test } from "node:test";
import assert from "node:assert/strict";
import { activitySignatures, changedKeys, pullRequestThreads } from "../src/pullRequestKeys.ts";
import { buildForest, type TreeThread } from "../src/tree.ts";

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

test("a streaming agent's updates never mark its PRs for refetch; the turn ending does", () => {
  const start = activitySignatures([thread("a", { status: "active", updatedAt: 1 }), thread("b", { updatedAt: 1 })]);
  const streaming = activitySignatures([thread("a", { status: "active", updatedAt: 2 }), thread("b", { updatedAt: 1 })]);
  assert.deepEqual(changedKeys(start, streaming), []);
  const ended = activitySignatures([thread("a", { status: "idle", updatedAt: 3 }), thread("b", { updatedAt: 1 })]);
  assert.deepEqual(changedKeys(streaming, ended), ["a"]);
});

test("only threads whose activity moved are refetched; new threads load on their own", () => {
  const before = activitySignatures([thread("a", { updatedAt: 1 }), thread("b", { updatedAt: 1 })]);
  const after = activitySignatures([thread("a", { updatedAt: 1 }), thread("b", { updatedAt: 5 }), thread("new", { updatedAt: 9 })]);
  assert.deepEqual(changedKeys(before, after), ["b"]);
});

test("under Show archived the PR query still covers the active threads Recent Activity draws", () => {
  const active = buildForest([thread("recent"), thread("kid", { parentThreadId: "recent" })]);
  const archived = buildForest([thread("old", { isArchived: true })]);
  assert.deepEqual(pullRequestThreads(active, archived).map((t) => t.id).sort(), ["kid", "old", "recent"]);
  assert.deepEqual(pullRequestThreads(active, active).map((t) => t.id).sort(), ["kid", "recent"]);
});
