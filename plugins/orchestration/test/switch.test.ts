import { test } from "node:test";
import assert from "node:assert/strict";
import { orchestratorLookupKeys, pendingSwitch } from "../src/switch.ts";

test("header thread ids that aren't thread ids never reach the orchestrator lookup", () => {
  assert.deepEqual(orchestratorLookupKeys(["", "thr_abc123", "draft", "thr_abc123", "thr_def456"]), ["thr_abc123", "thr_def456"]);
  assert.deepEqual(orchestratorLookupKeys([""]), []);
});

test("the lookup batch stays within the RPC's 200-key limit", () => {
  const ids = Array.from({ length: 250 }, (_, i) => `thr_${i}`);
  assert.equal(orchestratorLookupKeys(ids).length, 200);
});

test("every reader sees the switch's pending value until the setting catches up", () => {
  const pending = pendingSwitch();
  let notified = 0;
  pending.subscribe(() => notified++);
  assert.equal(pending.get(), null);
  pending.set(false);
  assert.equal(pending.get(), false);
  assert.equal(notified, 1);
  pending.settle(true);
  assert.equal(pending.get(), false, "a stale stored value doesn't clear the pending one");
  pending.settle(false);
  assert.equal(pending.get(), null);
  assert.equal(notified, 2);
});

test("a failed write drops the pending value", () => {
  const pending = pendingSwitch();
  pending.set(false);
  pending.clear();
  assert.equal(pending.get(), null);
});

test("an unsubscribed listener isn't called", () => {
  const pending = pendingSwitch();
  let notified = 0;
  const off = pending.subscribe(() => notified++);
  off();
  pending.set(true);
  assert.equal(notified, 0);
});
