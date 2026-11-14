import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectFolderHistory, lineageProjectIds } from "../src/projectFolders.ts";

function storage() {
  const values = new Map<string, unknown>();
  return { get: async (key: string) => values.get(key) ?? null, set: async (key: string, next: unknown) => { values.set(key, structuredClone(next)); } };
}

test("seeds active and archived pages once and survives a fresh server instance after deletion", async () => {
  const kv = storage();
  const calls: { archived: boolean; offset: number }[] = [];
  const history = createProjectFolderHistory(kv, async (args) => {
    calls.push(args);
    return { threads: args.offset === 0 ? Array.from({ length: args.archived ? 1 : 200 }, () => ({
      projectId: args.archived ? "archived" : "active", visibility: "visible",
    })) : [{ projectId: "page2", visibility: "visible" }] };
  });
  assert.deepEqual((await history.list()).projectIds, ["active", "page2", "archived"]);
  await history.list();
  assert.deepEqual(calls.map(({ archived, offset }) => [archived, offset]), [[false, 0], [false, 200], [true, 0]]);
  const fresh = createProjectFolderHistory(kv, async () => ({ threads: [] }));
  assert.deepEqual((await fresh.list()).projectIds, ["active", "page2", "archived"]);
});

test("concurrent events and reads preserve every visible project and ignore hidden threads", async () => {
  const history = createProjectFolderHistory(storage(), async () => ({ threads: [] }));
  await Promise.all([
    history.record({ projectId: "one", visibility: "visible" }),
    history.list(),
    history.record({ projectId: "two", visibility: "visible" }),
    history.record({ projectId: "secret", visibility: "hidden" }),
  ]);
  assert.deepEqual((await history.list()).projectIds, ["one", "two"]);
});

test("a failed seed retries without discarding recorded projects", async () => {
  let fail = true;
  const history = createProjectFolderHistory(storage(), async () => {
    if (fail) throw new Error("offline");
    return { threads: [{ projectId: "old", visibility: "visible" }] };
  });
  await assert.rejects(history.list(), /offline/);
  await history.record({ projectId: "new", visibility: "visible" });
  fail = false;
  assert.deepEqual((await history.list()).projectIds, ["new", "old"]);
});

test("the seed takes each project's last turn from archived threads too, crediting ancestors' projects", async () => {
  const history = createProjectFolderHistory(storage(), async ({ archived }) => ({
    threads: archived
      ? [
        { id: "orch", parentThreadId: null, projectId: "p", visibility: "visible", latestAttentionAt: 50 },
        { id: "kid", parentThreadId: "orch", projectId: "other", visibility: "visible", latestAttentionAt: 70 },
      ]
      : [{ id: "left", parentThreadId: null, projectId: "p", visibility: "visible", latestAttentionAt: 10 }],
  }));
  assert.deepEqual((await history.list()).lastActivityAt, { p: 70, other: 70 });
});

test("recorded turns raise a project's activity, never lower it, and survive a fresh server", async () => {
  const kv = storage();
  const history = createProjectFolderHistory(kv, async () => ({ threads: [] }));
  await history.recordActivity(["p", "root-project"], 100);
  await history.recordActivity(["p"], 40);
  assert.deepEqual((await history.list()).lastActivityAt, { p: 100, "root-project": 100 });
  const fresh = createProjectFolderHistory(kv, async () => ({ threads: [{ projectId: "p", visibility: "visible", latestAttentionAt: 5 }] }));
  assert.deepEqual((await fresh.list()).lastActivityAt, { p: 100, "root-project": 100 });
});

test("a thread's lineage lists its project, then its ancestors', once each, and stops on a cycle", () => {
  const threads = new Map([
    ["a", { id: "a", parentThreadId: "b", projectId: "x", visibility: "visible" }],
    ["b", { id: "b", parentThreadId: "a", projectId: "y", visibility: "visible" }],
  ]);
  assert.deepEqual(lineageProjectIds({ id: "c", parentThreadId: "a", projectId: "x", visibility: "visible" }, (id) => threads.get(id)), ["x", "y"]);
  assert.deepEqual(lineageProjectIds({ projectId: "z", visibility: "visible", parentThreadId: "missing" }, () => undefined), ["z"]);
});
