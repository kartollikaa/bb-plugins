import { test } from "node:test";
import assert from "node:assert/strict";
import { createPendingActions } from "../src/pendingActions.ts";

test("an action already in flight for a thread can't start again from another copy of its button", () => {
  const pending = createPendingActions({ setTimer: () => 0, clearTimer: () => undefined });
  const seen: number[] = [];
  const stop = pending.subscribe(() => seen.push(pending.has("retry:t1") ? 1 : 0));
  const release = pending.begin("retry:t1");
  assert.ok(release);
  assert.equal(pending.begin("retry:t1"), null);
  assert.ok(pending.begin("resend:t1"), "a different action runs on its own");
  release();
  assert.equal(pending.has("retry:t1"), false);
  const again = pending.begin("retry:t1");
  assert.ok(again);
  stop();
  again();
  assert.deepEqual(seen, [1, 1, 0, 1]);
});

test("an action whose call never settles frees its button after a while", () => {
  const timers: { run: () => void; ms: number }[] = [];
  const pending = createPendingActions({ expireMs: 30_000, setTimer: (run, ms) => { timers.push({ run, ms }); return timers.length; }, clearTimer: () => undefined });
  const seen: boolean[] = [];
  pending.subscribe(() => seen.push(pending.has("retry:t1")));
  pending.begin("retry:t1");
  assert.equal(timers[0]!.ms, 30_000);
  timers[0]!.run();
  assert.equal(pending.has("retry:t1"), false);
  assert.deepEqual(seen, [true, false]);
});

test("a stale expiry timer doesn't end a newer run of the same action", () => {
  const timers: (() => void)[] = [];
  const cleared: number[] = [];
  const pending = createPendingActions({ expireMs: 1, setTimer: (run) => timers.push(run), clearTimer: (id) => cleared.push(id) });
  pending.begin("retry:t1")!();
  assert.deepEqual(cleared, [1]);
  pending.begin("retry:t1");
  timers[0]!();
  assert.equal(pending.has("retry:t1"), true);
});

test("an expired call that settles late doesn't free the newer run of the same action", () => {
  const timers: (() => void)[] = [];
  const pending = createPendingActions({ expireMs: 1, setTimer: (run) => timers.push(run), clearTimer: () => undefined });
  const stale = pending.begin("retry:t1")!;
  timers[0]!();
  assert.ok(pending.begin("retry:t1"));
  stale();
  assert.equal(pending.has("retry:t1"), true);
});
