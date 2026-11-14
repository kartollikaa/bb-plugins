import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveInTurn, settlesTrue } from "../src/archiveRun.ts";

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

test("an archive that lands after bb's action settles still counts", async () => {
  let reads = 0;
  const sleeps: number[] = [];
  const archived = await settlesTrue(async () => ++reads >= 3, { attempts: 5, delayMs: 200, sleep: async (ms) => void sleeps.push(ms) });
  assert.equal(archived, true);
  assert.deepEqual(sleeps, [200, 200]);
});

test("a thread that never lands archived reads as cancelled once the wait runs out", async () => {
  let reads = 0;
  const archived = await settlesTrue(async () => (++reads, false), { attempts: 4, delayMs: 1, sleep: async () => undefined });
  assert.equal(archived, false);
  assert.equal(reads, 4);
});
