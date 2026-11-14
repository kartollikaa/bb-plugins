import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveInTurn } from "../src/archiveRun.ts";

test("bb's Archive runs on each root in turn, waiting for the one before", async () => {
  const log: string[] = [];
  const archived = new Set<string>();
  const result = await archiveInTurn(
    ["a", "b"],
    (id) => async () => {
      log.push(`run ${id}`);
      await Promise.resolve();
      archived.add(id);
    },
    async (id) => archived.has(id),
  );
  assert.deepEqual(result, { archived: ["a", "b"], stopped: false });
  assert.deepEqual(log, ["run a", "run b"]);
});

test("a cancelled confirmation stops the run, so later roots aren't asked about", async () => {
  const log: string[] = [];
  const result = await archiveInTurn(
    ["a", "b", "c"],
    (id) => async () => void log.push(id),
    async (id) => id === "a",
  );
  assert.deepEqual(result, { archived: ["a"], stopped: true });
  assert.deepEqual(log, ["a", "b"]);
});

test("a root bb offers no Archive for stops the run", async () => {
  const result = await archiveInTurn(["a", "b"], (id) => (id === "a" ? undefined : async () => undefined), async () => true);
  assert.deepEqual(result, { archived: [], stopped: true });
});
