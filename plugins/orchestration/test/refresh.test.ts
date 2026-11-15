import { test } from "node:test";
import assert from "node:assert/strict";
import { changeWatcher, turnSignal } from "../src/refresh.ts";

test("the orchestrator's turn ending changes the signal", () => {
  const working = turnSignal({ status: "running", latestAttentionAt: 100, hasPendingInteraction: false });
  const idle = turnSignal({ status: "idle", latestAttentionAt: 200, hasPendingInteraction: false });
  const asking = turnSignal({ status: "idle", latestAttentionAt: 200, hasPendingInteraction: true });
  assert.notEqual(working, idle);
  assert.notEqual(idle, asking);
  assert.equal(idle, turnSignal({ status: "idle", latestAttentionAt: 200, hasPendingInteraction: false }));
  assert.equal(turnSignal(undefined), null);
});

test("the watcher fires on a change, not on the first signal, a repeat or a missing thread", () => {
  let fired = 0;
  const watch = changeWatcher(() => fired++);
  watch("a");
  assert.equal(fired, 0);
  watch("a");
  assert.equal(fired, 0);
  watch(null);
  assert.equal(fired, 0);
  watch("b");
  assert.equal(fired, 1);
  watch("b");
  watch("c");
  assert.equal(fired, 2);
});
