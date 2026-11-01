import { test } from "node:test";
import assert from "node:assert/strict";
import { ancestorsOf, buildForest, effectiveState, groupRows, summarize, type TreeThread } from "../src/tree.ts";
import type { Subagent } from "../src/subagents.ts";

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
  activity: { backgroundAgents: 0 },
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const ids = (rows: { thread: TreeThread; depth: number }[]) => rows.map((r) => `${"-".repeat(r.depth)}${r.thread.id}`);

test("children nest under their parent in spawn order, any depth", () => {
  const threads = [
    thread("root", { updatedAt: 10 }),
    thread("b", { parentThreadId: "root", createdAt: 2 }),
    thread("a", { parentThreadId: "root", createdAt: 1 }),
    thread("a1", { parentThreadId: "a", createdAt: 3 }),
    thread("other", { updatedAt: 5 }),
  ];
  const [group] = groupRows(buildForest(threads), new Set(), new Set());
  assert.deepEqual(ids(group!.rows), ["root", "-a", "--a1", "-b", "other"]);
  assert.equal(group!.rows[0]!.descendantCount, 3);
});

test("a child in another project still sits under its parent", () => {
  const threads = [thread("parent"), thread("child", { projectId: "p2", parentThreadId: "parent" })];
  const groups = groupRows(buildForest(threads), new Set(), new Set());
  assert.equal(groups.length, 1);
  assert.deepEqual(ids(groups[0]!.rows), ["parent", "-child"]);
});

test("lifecycle owner is the fallback parent", () => {
  const threads = [thread("owner"), thread("worker", { lifecycleOwnerThreadId: "owner" })];
  assert.deepEqual(ids(groupRows(buildForest(threads), new Set(), new Set())[0]!.rows), ["owner", "-worker"]);
});

test("hidden and archived threads drop out; orphans become roots", () => {
  const threads = [
    thread("gone", { isArchived: true }),
    thread("orphan", { parentThreadId: "gone" }),
    thread("ghost", { isHidden: true }),
  ];
  assert.deepEqual(ids(groupRows(buildForest(threads), new Set(), new Set())[0]!.rows), ["orphan"]);
});

test("a parent cycle still draws every thread exactly once", () => {
  const threads = [thread("x", { parentThreadId: "y", updatedAt: 2 }), thread("y", { parentThreadId: "x", updatedAt: 1 })];
  const rows = groupRows(buildForest(threads), new Set(), new Set())[0]!.rows;
  assert.deepEqual(ids(rows), ["x", "-y"]);
});

test("collapsing hides the subtree and flags live work inside it", () => {
  const threads = [thread("root"), thread("kid", { parentThreadId: "root", status: "active" })];
  const rows = groupRows(buildForest(threads), new Set(["root"]), new Set())[0]!.rows;
  assert.deepEqual(ids(rows), ["root"]);
  assert.equal(rows[0]!.hasHiddenActivity, true);
  assert.equal(rows[0]!.descendantCount, 1);
});

test("pinned threads detach into the Pinned group with their subtree", () => {
  const threads = [
    thread("parent", { updatedAt: 9 }),
    thread("pinnedKid", { parentThreadId: "parent", isPinned: true, pinSortKey: "a" }),
    thread("grandkid", { parentThreadId: "pinnedKid" }),
  ];
  const groups = groupRows(buildForest(threads), new Set(), new Set());
  assert.deepEqual(groups.map((g) => g.key), ["pinned", "project:p1"]);
  assert.deepEqual(ids(groups[0]!.rows), ["pinnedKid", "-grandkid"]);
  assert.deepEqual(ids(groups[1]!.rows), ["parent"]);
});

test("projects order by their latest activity; a collapsed group has no rows", () => {
  const threads = [thread("old", { projectId: "a", updatedAt: 1 }), thread("new", { projectId: "b", updatedAt: 5 })];
  const groups = groupRows(buildForest(threads), new Set(), new Set(["project:a"]));
  assert.deepEqual(groups.map((g) => [g.key, g.rows.length]), [["project:b", 1], ["project:a", 0]]);
});

test("ancestorsOf walks to the root", () => {
  const forest = buildForest([thread("r"), thread("m", { parentThreadId: "r" }), thread("l", { parentThreadId: "m" })]);
  assert.deepEqual(ancestorsOf(forest, "l"), ["m", "r"]);
});

const agent = (extra: Partial<Subagent>): Subagent => ({
  id: "s",
  label: "S",
  agentType: null,
  background: false,
  state: "running",
  startedAt: 0,
  endedAt: null,
  totalTokens: null,
  toolUses: null,
  ...extra,
});

test("a running subagent under a thread with no live work reads stopped", () => {
  assert.equal(effectiveState(agent({}), thread("t", { status: "idle" })), "stopped");
  assert.equal(effectiveState(agent({}), thread("t", { status: "active" })), "running");
  assert.equal(effectiveState(agent({ background: true }), thread("t", { activity: { backgroundAgents: 1 } })), "running");
  assert.equal(effectiveState(agent({ state: "failed" }), thread("t")), "failed");
});

test("summary dot prefers running, then failed", () => {
  const live = thread("t", { status: "active" });
  assert.equal(summarize(2, [agent({}), agent({ state: "failed" })], live).dot, "running");
  assert.equal(summarize(2, [agent({ state: "completed" }), agent({ state: "failed" })], live).dot, "failed");
  assert.deepEqual(summarize(1, [agent({ state: "completed" })], live), { total: 1, running: 0, failed: 0, dot: "done" });
});
