import { test } from "node:test";
import assert from "node:assert/strict";
import { createPendingActions } from "../src/pendingActions.ts";

test("an action already in flight for a thread can't start again from another copy of its button", () => {
  const pending = createPendingActions();
  const seen: number[] = [];
  const stop = pending.subscribe(() => seen.push(pending.has("retry:t1") ? 1 : 0));
  assert.equal(pending.begin("retry:t1"), true);
  assert.equal(pending.begin("retry:t1"), false);
  assert.equal(pending.begin("resend:t1"), true, "a different action runs on its own");
  pending.end("retry:t1");
  assert.equal(pending.has("retry:t1"), false);
  assert.equal(pending.begin("retry:t1"), true);
  stop();
  pending.end("retry:t1");
  assert.deepEqual(seen, [1, 1, 0, 1]);
});
