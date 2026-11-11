import { test } from "node:test";
import assert from "node:assert/strict";
import { ancestorsOf, buildForest, countStates, effectiveState, groupRows, placeNear, readFolderSorts, rememberProjectFolders, recentThreads, resolveProjectOrder, summarize, threadDotState, type TreeThread } from "../src/tree.ts";
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
  indicator: "none",
  hasPendingInteraction: false,
  activity: { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 },
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
  const [group] = groupRows(buildForest(threads), new Set());
  assert.deepEqual(ids(group!.rows), ["root", "-a", "--a1", "-b", "other"]);
  assert.equal(group!.rows[0]!.descendantCount, 3);
});

test("a child in another project still sits under its parent", () => {
  const threads = [thread("parent"), thread("child", { projectId: "p2", parentThreadId: "parent" })];
  const groups = groupRows(buildForest(threads), new Set());
  assert.equal(groups.length, 1);
  assert.deepEqual(ids(groups[0]!.rows), ["parent", "-child"]);
});

test("lifecycle owner is the fallback parent", () => {
  const threads = [thread("owner"), thread("worker", { lifecycleOwnerThreadId: "owner" })];
  assert.deepEqual(ids(groupRows(buildForest(threads), new Set())[0]!.rows), ["owner", "-worker"]);
});

test("hidden threads drop out; orphans become roots", () => {
  const threads = [thread("orphan", { parentThreadId: "gone" }), thread("ghost", { isHidden: true })];
  assert.deepEqual(ids(groupRows(buildForest(threads), new Set())[0]!.rows), ["orphan"]);
});

test("archived threads nest like active ones, for the archived view", () => {
  const threads = [
    thread("parent", { isArchived: true, updatedAt: 2 }),
    thread("kid", { isArchived: true, parentThreadId: "parent", updatedAt: 1 }),
  ];
  assert.deepEqual(ids(groupRows(buildForest(threads), new Set())[0]!.rows), ["parent", "-kid"]);
});

test("a parent cycle still draws every thread exactly once", () => {
  const threads = [thread("x", { parentThreadId: "y", updatedAt: 2 }), thread("y", { parentThreadId: "x", updatedAt: 1 })];
  const rows = groupRows(buildForest(threads), new Set())[0]!.rows;
  assert.deepEqual(ids(rows), ["x", "-y"]);
});

test("collapsing hides the subtree and flags live work inside it", () => {
  const threads = [thread("root"), thread("kid", { parentThreadId: "root", status: "active" })];
  const rows = groupRows(buildForest(threads), new Set(["root"]))[0]!.rows;
  assert.deepEqual(ids(rows), ["root"]);
  assert.deepEqual(rows[0]!.foldCounts, { running: 1 });
  assert.equal(rows[0]!.descendantCount, 1);
  assert.equal(rows[0]!.hasVisibleChildren, false);
});

test("pinned threads detach into the Pinned group with their subtree", () => {
  const threads = [
    thread("parent", { updatedAt: 9 }),
    thread("pinnedKid", { parentThreadId: "parent", isPinned: true, pinSortKey: "a" }),
    thread("grandkid", { parentThreadId: "pinnedKid" }),
  ];
  const groups = groupRows(buildForest(threads), new Set());
  assert.deepEqual(groups.map((g) => g.key), ["pinned", "project:p1"]);
  assert.deepEqual(ids(groups[0]!.rows), ["pinnedKid", "-grandkid"]);
  assert.deepEqual(ids(groups[1]!.rows), ["parent"]);
});

test("projects order by their latest activity", () => {
  const threads = [thread("old", { projectId: "a", updatedAt: 1 }), thread("new", { projectId: "b", updatedAt: 5 })];
  const groups = groupRows(buildForest(threads), new Set());
  assert.deepEqual(groups.map((g) => [g.key, g.rows.length]), [["project:b", 1], ["project:a", 1]]);
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
  assert.equal(effectiveState(agent({ background: true }), thread("t", { activity: { backgroundAgents: 1, backgroundCommands: 0, workflows: 0 } })), "running");
  assert.equal(effectiveState(agent({ state: "failed" }), thread("t")), "failed");
});

test("summary dot prefers running, then failed", () => {
  const live = thread("t", { status: "active" });
  assert.equal(summarize(2, [agent({}), agent({ state: "failed" })], live).dot, "running");
  assert.equal(summarize(2, [agent({ state: "completed" }), agent({ state: "failed" })], live).dot, "error");
  assert.deepEqual(summarize(1, [agent({ state: "completed" })], live), { total: 1, running: 0, failed: 0, dot: "done" });
});

test("thread dot: input, then unread error, then running, else done", () => {
  assert.equal(threadDotState(thread("t", { hasPendingInteraction: true, status: "active" })), "input");
  assert.equal(threadDotState(thread("t", { indicator: "waiting-for-input" })), "input");
  assert.equal(threadDotState(thread("t", { indicator: "unread-error" })), "error");
  assert.equal(threadDotState(thread("t", { status: "active" })), "running");
  assert.equal(threadDotState(thread("t")), "done");
});

test("a fold counts its whole subtree by state, at any depth, and lets input peek out", () => {
  const threads = [
    thread("root"),
    thread("busy", { parentThreadId: "root", status: "active", createdAt: 1 }),
    thread("mid", { parentThreadId: "root", createdAt: 2 }),
    thread("asking", { parentThreadId: "mid", hasPendingInteraction: true }),
    thread("broke", { parentThreadId: "root", indicator: "unread-error", createdAt: 3 }),
  ];
  const forest = buildForest(threads);
  const rootFolded = groupRows(forest, new Set(["root"]))[0]!.rows;
  assert.deepEqual(ids(rootFolded), ["root", "-asking"]);
  assert.deepEqual(rootFolded[0]!.foldCounts, { running: 1, done: 1, input: 1, error: 1 });
  assert.equal(rootFolded[0]!.hasVisibleChildren, true);
  assert.equal(rootFolded[1]!.isPeek, true);
  assert.deepEqual(rootFolded[1]!.guides, [false]);

  const midFolded = groupRows(forest, new Set(["mid"]))[0]!.rows;
  assert.deepEqual(ids(midFolded), ["root", "-busy", "-mid", "--asking", "-broke"]);
  assert.deepEqual(midFolded.find((r) => r.thread.id === "mid")!.foldCounts, { input: 1 });
  assert.equal(midFolded.find((r) => r.thread.id === "root")!.foldCounts, null);
  assert.equal(midFolded.find((r) => r.thread.id === "busy")!.isPeek, false);
});

test("the open thread shows through its folded ancestors until it is left", () => {
  const threads = [
    thread("root"),
    thread("mid", { parentThreadId: "root", createdAt: 1 }),
    thread("open", { parentThreadId: "mid" }),
    thread("open-kid", { parentThreadId: "open", status: "active" }),
    thread("other", { parentThreadId: "root", createdAt: 2 }),
  ];
  const forest = buildForest(threads);
  const folded = new Set(["root", "mid"]);
  const whileOpen = groupRows(forest, folded, "project", null, "open")[0]!.rows;
  assert.deepEqual(ids(whileOpen), ["root", "-open", "--open-kid"]);
  assert.deepEqual(whileOpen[0]!.foldCounts, { done: 3, running: 1 });
  assert.equal(whileOpen[1]!.isPeek, true);
  assert.equal(whileOpen[2]!.isPeek, false);

  const afterLeaving = groupRows(forest, folded, "project", null, "elsewhere")[0]!.rows;
  assert.deepEqual(ids(afterLeaving), ["root"]);
  assert.deepEqual(afterLeaving[0]!.foldCounts, { done: 3, running: 1 });
});

test("status grouping files a root by its most urgent subtree state, urgent groups first", () => {
  const threads = [
    thread("calm", { updatedAt: 9 }),
    thread("busy", { status: "active" }),
    thread("parent"),
    thread("asking", { parentThreadId: "parent", hasPendingInteraction: true }),
    thread("broke", { indicator: "unread-error" }),
    thread("pin", { isPinned: true, status: "active" }),
  ];
  const groups = groupRows(buildForest(threads), new Set(), "status");
  assert.deepEqual(
    groups.map((g) => [g.key, ids(g.rows)]),
    [
      ["pinned", ["pin"]],
      ["status:input", ["parent", "-asking"]],
      ["status:error", ["broke"]],
      ["status:running", ["busy"]],
      ["status:done", ["calm"]],
    ],
  );
});

test("no grouping puts every unpinned root in one group by activity", () => {
  const threads = [thread("a", { projectId: "x", updatedAt: 1 }), thread("b", { projectId: "y", updatedAt: 2 })];
  const groups = groupRows(buildForest(threads), new Set(), "none");
  assert.deepEqual(groups.map((g) => [g.key, ids(g.rows)]), [["all", ["b", "a"]]]);
});

test("recent activity is flat, newest first, children included, hidden and archived left out", () => {
  const threads = [
    thread("old", { updatedAt: 1 }),
    thread("kid", { parentThreadId: "old", updatedAt: 5 }),
    thread("mid", { updatedAt: 3 }),
    thread("gone", { isArchived: true, updatedAt: 9 }),
    thread("ghost", { isHidden: true, updatedAt: 8 }),
  ];
  assert.deepEqual(recentThreads(threads, 2).map((t) => t.id), ["kid", "mid"]);
  assert.deepEqual(recentThreads(threads, 10).map((t) => t.id), ["kid", "mid", "old"]);
});

test("a background command, workflow, or bb working indicator counts as running", () => {
  const idle = { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 };
  assert.equal(threadDotState(thread("t", { activity: { ...idle, backgroundCommands: 1 } })), "running");
  assert.equal(threadDotState(thread("t", { activity: { ...idle, workflows: 1 } })), "running");
  assert.equal(threadDotState(thread("t", { indicator: "background-command" })), "running");
  assert.equal(threadDotState(thread("t", { indicator: "runtime" })), "running");
  assert.equal(threadDotState(thread("t", { indicator: "unread-success" })), "done");
});

test("guide lines run on past middle children and bend at the last one", () => {
  const threads = [
    thread("root"),
    thread("a", { parentThreadId: "root", createdAt: 1 }),
    thread("a1", { parentThreadId: "a", createdAt: 2 }),
    thread("b", { parentThreadId: "root", createdAt: 3 }),
  ];
  const rows = groupRows(buildForest(threads), new Set())[0]!.rows;
  assert.deepEqual(
    rows.map((r) => [r.thread.id, r.guides]),
    [
      ["root", []],
      ["a", [true]],
      ["a1", [true, false]],
      ["b", [false]],
    ],
  );
});

test("a fixed project order ignores activity", () => {
  const threads = [thread("a", { projectId: "pa", updatedAt: 1 }), thread("b", { projectId: "pb", updatedAt: 9 })];
  const forest = buildForest(threads);
  assert.deepEqual(groupRows(forest, new Set(), "project", ["pa", "pb"]).map((g) => g.key), ["project:pa", "project:pb"]);
  assert.deepEqual(groupRows(forest, new Set(), "project", null).map((g) => g.key), ["project:pb", "project:pa"]);
  assert.deepEqual(groupRows(forest, new Set(), "project", ["pb"]).map((g) => g.key), ["project:pb", "project:pa"]);
});

test("project order keeps the saved order, then bb's with personal first, and drops gone ids", () => {
  const projects = [
    { id: "x", isPersonal: false },
    { id: "me", isPersonal: true },
    { id: "y", isPersonal: false },
    { id: "z", isPersonal: false },
  ];
  assert.deepEqual(resolveProjectOrder([], projects), ["me", "x", "y", "z"]);
  assert.deepEqual(resolveProjectOrder(["z", "gone", "x", "z"], projects), ["z", "x", "me", "y"]);
});

test("a thread whose turn failed is red even once read, and outranks live background work", () => {
  const busy = { backgroundAgents: 0, backgroundCommands: 1, workflows: 0 };
  assert.equal(threadDotState(thread("t", { status: "error" })), "error");
  assert.equal(threadDotState(thread("t", { status: "error", activity: busy, indicator: "runtime" })), "error");
});

test("the overview counts visible active threads by their own state", () => {
  const counts = countStates([
    thread("a", { status: "active" }),
    thread("b", { hasPendingInteraction: true }),
    thread("c", { status: "active", isArchived: true }),
    thread("d", { isHidden: true, status: "active" }),
    thread("e"),
  ]);
  assert.deepEqual(counts, { running: 1, input: 1, done: 1 });
});

test("placeNear drops a block before or after its target", () => {
  assert.deepEqual(placeNear(["a", "b", "c"], "a", "c", true), ["b", "c", "a"]);
  assert.deepEqual(placeNear(["a", "b", "c"], "a", "c", false), ["b", "a", "c"]);
  assert.deepEqual(placeNear(["a", "b", "c"], "c", "a", false), ["c", "a", "b"]);
  assert.deepEqual(placeNear(["a", "b", "c"], "b", "b", true), ["a", "b", "c"]);
  assert.deepEqual(placeNear(["a", "b"], "a", "zz", true), ["a", "b"]);
});

test("folder creation order stays fixed when activity changes, with nested children intact", () => {
  const threads = [
    thread("old", { createdAt: 1, updatedAt: 30 }),
    thread("new", { createdAt: 2, updatedAt: 10 }),
    thread("kid", { parentThreadId: "new", createdAt: 3 }),
  ];
  const rows = (sort: "activity" | "created") => ids(groupRows(buildForest(threads), new Set(), "project", null, null, { "project:p1": sort })[0]!.rows);
  assert.deepEqual(rows("activity"), ["old", "new", "-kid"]);
  assert.deepEqual(rows("created"), ["new", "-kid", "old"]);
  threads[0]!.updatedAt = 100;
  threads[1]!.updatedAt = 200;
  assert.deepEqual(rows("activity"), ["new", "-kid", "old"]);
  assert.deepEqual(rows("created"), ["new", "-kid", "old"]);
});

test("status sort uses the subtree priority and stable creation order within a status", () => {
  const threads = [
    thread("done", { updatedAt: 100 }),
    thread("busy", { status: "active" }),
    thread("error", { status: "error" }),
    thread("parent"),
    thread("input", { parentThreadId: "parent", hasPendingInteraction: true }),
    thread("new-busy", { status: "active", createdAt: 10 }),
  ];
  const rows = () => ids(groupRows(buildForest(threads), new Set(), "none", null, null, { all: "status" })[0]!.rows);
  assert.deepEqual(rows(), ["parent", "-input", "error", "new-busy", "busy", "done"]);
  threads[1]!.updatedAt = 1000;
  assert.deepEqual(rows(), ["parent", "-input", "error", "new-busy", "busy", "done"]);
});

test("folder sorts are independent and pinned roots retain their manual order", () => {
  const threads = [
    thread("a-old", { projectId: "a", createdAt: 1, updatedAt: 20 }),
    thread("a-new", { projectId: "a", createdAt: 2, updatedAt: 10 }),
    thread("b-old", { projectId: "b", createdAt: 1, updatedAt: 20 }),
    thread("b-new", { projectId: "b", createdAt: 2, updatedAt: 10 }),
    thread("pin-first", { isPinned: true, pinSortKey: "a", createdAt: 1 }),
    thread("pin-last", { isPinned: true, pinSortKey: "b", createdAt: 2 }),
  ];
  const groups = groupRows(buildForest(threads), new Set(), "project", ["a", "b"], null, { "project:a": "created", pinned: "created" });
  assert.deepEqual(groups.map((g) => ids(g.rows)), [["pin-first", "pin-last"], ["a-new", "a-old"], ["b-old", "b-new"]]);
});

test("folder sorts reject malformed storage and keep only known modes", () => {
  assert.deepEqual(readFolderSorts({ a: "created", b: "status", c: "activity", d: "bogus", e: null }), { a: "created", b: "status", c: "activity" });
  for (const raw of [null, [], "created", 5]) assert.deepEqual(readFolderSorts(raw), {});
});

test("global sort applies across folders while local overrides take precedence", () => {
  const threads = [
    thread("a-old", { projectId: "a", createdAt: 1, updatedAt: 20 }),
    thread("a-new", { projectId: "a", createdAt: 2, updatedAt: 10 }),
    thread("b-old", { projectId: "b", createdAt: 1, updatedAt: 20 }),
    thread("b-new", { projectId: "b", createdAt: 2, updatedAt: 10 }),
  ];
  const rows = (overrides: Record<string, "activity">) => groupRows(buildForest(threads), new Set(), "project", ["a", "b"], null, overrides, "created").map((g) => ids(g.rows));
  assert.deepEqual(rows({}), [["a-new", "a-old"], ["b-new", "b-old"]]);
  assert.deepEqual(rows({ "project:a": "activity" }), [["a-old", "a-new"], ["b-new", "b-old"]]);
  assert.deepEqual(rows({}), [["a-new", "a-old"], ["b-new", "b-old"]]);
});


test("used project folders survive the last thread disappearing and a storage round trip", () => {
  const projects = [{ id: "p1" }, { id: "unused" }];
  const saved = rememberProjectFolders([], projects, [thread("last")]);
  assert.deepEqual(saved, ["p1"]);
  const restored = rememberProjectFolders(JSON.parse(JSON.stringify(saved)), projects, []);
  const groups = groupRows(buildForest([]), new Set(), "project", null, null, {}, "activity", restored);
  assert.deepEqual(groups.map(({ projectId, rootCount, rows }) => ({ projectId, rootCount, rows })), [
    { projectId: "p1", rootCount: 0, rows: [] },
  ]);
});

test("retention includes pinned, child and archived projects but excludes hidden and deleted projects", () => {
  const saved = rememberProjectFolders(["deleted", "p1"], [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "hidden" }], [
    thread("pinned", { isPinned: true }),
    thread("child", { projectId: "p2", parentThreadId: "pinned" }),
    thread("archived", { projectId: "p3", isArchived: true }),
    thread("hidden", { projectId: "hidden", isHidden: true }),
  ]);
  assert.deepEqual(saved, ["p1", "p2", "p3"]);
  assert.deepEqual(rememberProjectFolders(saved, [{ id: "p2" }], []), ["p2"]);
});

test("retained folders respect project order without duplicating populated folders", () => {
  const forest = buildForest([thread("root", { updatedAt: 10 })]);
  const groups = groupRows(forest, new Set(), "project", ["p2", "p1"], null, {}, "activity", ["p1", "p2"]);
  assert.deepEqual(groups.map((group) => [group.projectId, group.rootCount]), [["p2", 0], ["p1", 1]]);
  const activity = groupRows(forest, new Set(), "project", null, null, {}, "activity", ["p2"]);
  assert.deepEqual(activity.map((group) => group.projectId), ["p1", "p2"]);
  for (const mode of ["status", "none"] as const) {
    assert.deepEqual(groupRows(forest, new Set(), mode, null, null, {}, "activity", ["p2"]), groupRows(forest, new Set(), mode));
  }
});
