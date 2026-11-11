import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectFolderHistory } from "../src/projectFolders.ts";

function storage() {
  let value: unknown = null;
  return { get: async () => value, set: async (_key: string, next: string[]) => { value = structuredClone(next); } };
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
  assert.deepEqual(await history.list(), ["active", "page2", "archived"]);
  await history.list();
  assert.deepEqual(calls.map(({ archived, offset }) => [archived, offset]), [[false, 0], [false, 200], [true, 0]]);
  const fresh = createProjectFolderHistory(kv, async () => ({ threads: [] }));
  assert.deepEqual(await fresh.list(), ["active", "page2", "archived"]);
});

test("concurrent events and reads preserve every visible project and ignore hidden threads", async () => {
  const history = createProjectFolderHistory(storage(), async () => ({ threads: [] }));
  await Promise.all([
    history.record({ projectId: "one", visibility: "visible" }),
    history.list(),
    history.record({ projectId: "two", visibility: "visible" }),
    history.record({ projectId: "secret", visibility: "hidden" }),
  ]);
  assert.deepEqual(await history.list(), ["one", "two"]);
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
  assert.deepEqual(await history.list(), ["new", "old"]);
});
