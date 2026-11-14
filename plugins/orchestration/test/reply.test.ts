import { test } from "node:test";
import assert from "node:assert/strict";
import { createReplyTracker, quickReplies, replyDraft, replyKey, replySender, replyStatus, toDelivery, type Delivery } from "../src/reply.ts";

test("a quick reply reads Re «title»: option", () => {
  assert.equal(replyDraft("Merge PR #12?", "Merge it"), "Re «Merge PR #12?»: Merge it");
});

test("the ledger's ask options are the only quick replies", () => {
  const replies = quickReplies([
    "ask: Merge PR #12? | why: green | options: Merge it / Not now",
    "Nothing",
    "Pick a name for the plugin",
    "ask: Ship it? | options: Yes",
  ]);
  assert.deepEqual(replies, ["Re «Merge PR #12?»: Merge it", "Re «Merge PR #12?»: Not now", "Re «Ship it?»: Yes"]);
});

test("an ask's reply key is its title and options, not its place in the list", () => {
  assert.equal(replyKey("Merge?", ["Yes", "No"]), replyKey("Merge?", ["Yes", "No"]));
  assert.notEqual(replyKey("Merge?", ["Yes", "No"]), replyKey("Merge?", ["Yes"]));
  assert.notEqual(replyKey("Merge?", ["Yes", "No"]), replyKey("Ship?", ["Yes", "No"]));
  assert.notEqual(replyKey("a", ["b c"]), replyKey("a b", ["c"]));
});

test("bb's deferred delivery reads as queued", () => {
  assert.equal(toDelivery("sent"), "sent");
  assert.equal(toDelivery("queued"), "queued");
  assert.equal(toDelivery("deferred"), "queued");
});

function fakeSend(result: Delivery | Error = "sent") {
  const calls: [string, string][] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  return {
    calls,
    release,
    send: async (threadId: string, text: string): Promise<Delivery> => {
      calls.push([threadId, text]);
      await gate;
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

test("a double click sends one message, and the second call says it was already sent", async () => {
  const fake = fakeSend("queued");
  const reply = replySender(fake.send, { windowMs: 5_000, now: () => 0 });
  const a = reply("thr_o", "Re «X»: Yes");
  const b = reply("thr_o", "Re «X»: Yes");
  fake.release();
  assert.deepEqual(await Promise.all([a, b]), ["queued", "already"]);
  assert.equal(fake.calls.length, 1);
});

test("a repeat seconds later is deduped as already sent; a later one really sends", async () => {
  let t = 0;
  const fake = fakeSend("sent");
  fake.release();
  const reply = replySender(fake.send, { windowMs: 5_000, now: () => t });
  assert.equal(await reply("thr_o", "Re «X»: Yes"), "sent");
  t = 4_999;
  assert.equal(await reply("thr_o", "Re «X»: Yes"), "already");
  assert.equal(fake.calls.length, 1);
  t = 60_000;
  assert.equal(await reply("thr_o", "Re «X»: Yes"), "sent");
  assert.equal(fake.calls.length, 2);
});

test("different options or threads are separate messages", async () => {
  const fake = fakeSend("sent");
  fake.release();
  const reply = replySender(fake.send, { windowMs: 5_000, now: () => 0 });
  await reply("thr_o", "Re «X»: Yes");
  await reply("thr_o", "Re «X»: No");
  await reply("thr_p", "Re «X»: Yes");
  assert.equal(fake.calls.length, 3);
});

test("a failed send can be retried", async () => {
  const failing = fakeSend(new Error("offline"));
  failing.release();
  const reply = replySender(failing.send, { windowMs: 5_000, now: () => 0 });
  await assert.rejects(reply("thr_o", "Re «X»: Yes"), /offline/);
  await assert.rejects(reply("thr_o", "Re «X»: Yes"), /offline/);
  assert.equal(failing.calls.length, 2);
});

test("the tracker lets one click through per card and keeps the sent state", () => {
  const tracker = createReplyTracker(null, { now: () => 0 });
  const token = tracker.begin("thr_o", "ask-1", "Merge it");
  assert.notEqual(token, null);
  assert.equal(tracker.begin("thr_o", "ask-1", "Not now"), null);
  assert.deepEqual(tracker.get("thr_o", "ask-1"), { kind: "sending", option: "Merge it" });
  tracker.done("thr_o", "ask-1", token!, "queued");
  assert.deepEqual(tracker.get("thr_o", "ask-1"), { kind: "sent", option: "Merge it", delivery: "queued", at: 0 });
  assert.equal(tracker.begin("thr_o", "ask-1", "Merge it"), null);
});

test("a failure frees the card for another click", () => {
  const tracker = createReplyTracker(null, { now: () => 0 });
  const token = tracker.begin("thr_o", "ask-1", "Merge it")!;
  tracker.fail("thr_o", "ask-1", token);
  assert.equal(tracker.get("thr_o", "ask-1"), null);
  assert.notEqual(tracker.begin("thr_o", "ask-1", "Not now"), null);
});

test("an earlier attempt's result never lands on a later click", () => {
  const tracker = createReplyTracker(null, { now: () => 0 });
  const first = tracker.begin("thr_o", "ask-1", "Merge it")!;
  tracker.prune("thr_o", []);
  const second = tracker.begin("thr_o", "ask-1", "Not now")!;
  tracker.done("thr_o", "ask-1", first, "sent");
  assert.deepEqual(tracker.get("thr_o", "ask-1"), { kind: "sending", option: "Not now" });
  tracker.fail("thr_o", "ask-1", first);
  assert.deepEqual(tracker.get("thr_o", "ask-1"), { kind: "sending", option: "Not now" });
  tracker.done("thr_o", "ask-1", second, "queued");
  assert.deepEqual(tracker.get("thr_o", "ask-1"), { kind: "sent", option: "Not now", delivery: "queued", at: 0 });
});

test("the sent state goes once the ledger drops the ask, only for that orchestrator", () => {
  const tracker = createReplyTracker(null, { now: () => 0 });
  tracker.done("thr_o", "ask-1", tracker.begin("thr_o", "ask-1", "Merge it")!, "sent");
  tracker.begin("thr_o", "ask-2", "Yes");
  tracker.begin("thr_p", "ask-1", "Yes");
  tracker.prune("thr_o", ["ask-2"]);
  assert.equal(tracker.get("thr_o", "ask-1"), null);
  assert.notEqual(tracker.get("thr_o", "ask-2"), null);
  assert.notEqual(tracker.get("thr_p", "ask-1"), null);
});

test("subscribers hear every change", () => {
  const tracker = createReplyTracker(null, { now: () => 0 });
  let heard = 0;
  const off = tracker.subscribe(() => heard++);
  tracker.done("thr_o", "a", tracker.begin("thr_o", "a", "x")!, "sent");
  tracker.prune("thr_o", []);
  tracker.prune("thr_o", []);
  off();
  tracker.begin("thr_o", "b", "x");
  assert.equal(heard, 3);
});

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

test("a sent reply survives a reload until the ledger drops the ask; a send in flight does not", () => {
  const storage = memory();
  const first = createReplyTracker(storage, { now: () => 0 });
  first.done("thr_o", "ask-1", first.begin("thr_o", "ask-1", "Merge it")!, "queued");
  first.begin("thr_o", "ask-2", "Yes");
  const reloaded = createReplyTracker(storage, { now: () => 0 });
  assert.deepEqual(reloaded.get("thr_o", "ask-1"), { kind: "sent", option: "Merge it", delivery: "queued", at: 0 });
  assert.equal(reloaded.get("thr_o", "ask-2"), null);
  reloaded.prune("thr_o", []);
  assert.equal(createReplyTracker(storage, { now: () => 0 }).get("thr_o", "ask-1"), null);
});

test("stored replies of orchestrators that are never reopened expire and leave storage", () => {
  const storage = memory();
  let t = 0;
  const day = 24 * 60 * 60_000;
  const first = createReplyTracker(storage, { now: () => t, maxAgeMs: 7 * day });
  first.done("thr_gone", "a", first.begin("thr_gone", "a", "x")!, "sent");
  t = 6 * day;
  first.done("thr_o", "b", first.begin("thr_o", "b", "y")!, "sent");
  t = 8 * day;
  const reloaded = createReplyTracker(storage, { now: () => t, maxAgeMs: 7 * day });
  assert.equal(reloaded.get("thr_gone", "a"), null);
  assert.notEqual(reloaded.get("thr_o", "b"), null);
  const stored = storage.data.get("orchestration.sentReplies.v1")!;
  assert.ok(!stored.includes("thr_gone"));
  assert.ok(stored.includes("thr_o"));
});

test("unreadable or throwing storage leaves the tracker in memory", () => {
  const broken = { getItem: () => "{not json", setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
  const tracker = createReplyTracker(broken, { now: () => 0 });
  tracker.done("thr_o", "a", tracker.begin("thr_o", "a", "x")!, "sent");
  assert.deepEqual(tracker.get("thr_o", "a"), { kind: "sent", option: "x", delivery: "sent", at: 0 });
});

test("a sent card can send its answer again, and only from the sent state", () => {
  let t = 0;
  const tracker = createReplyTracker(null, { now: () => t });
  const first = tracker.begin("thr_o", "ask", "Not now")!;
  assert.equal(tracker.again("thr_o", "ask", "Not now"), null);
  tracker.done("thr_o", "ask", first, "sent");
  t = 2 * 60 * 60_000;
  const second = tracker.again("thr_o", "ask", "Merge it");
  assert.notEqual(second, null);
  assert.equal(tracker.again("thr_o", "ask", "Merge it"), null);
  assert.deepEqual(tracker.get("thr_o", "ask"), { kind: "sending", option: "Merge it" });
  tracker.done("thr_o", "ask", first, "queued");
  assert.deepEqual(tracker.get("thr_o", "ask"), { kind: "sending", option: "Merge it" });
  tracker.done("thr_o", "ask", second!, "queued");
  assert.deepEqual(tracker.get("thr_o", "ask"), { kind: "sent", option: "Merge it", delivery: "queued", at: t });
  assert.equal(tracker.again("thr_o", "missing", "x"), null);
});

test("a failed send-again frees the card", () => {
  const tracker = createReplyTracker(null, { now: () => 0 });
  tracker.done("thr_o", "ask", tracker.begin("thr_o", "ask", "Yes")!, "sent");
  tracker.fail("thr_o", "ask", tracker.again("thr_o", "ask", "Yes")!);
  assert.equal(tracker.get("thr_o", "ask"), null);
});

test("the sent status says what went and how long ago", () => {
  assert.equal(replyStatus({ kind: "sending", option: "Yes" }, 0), "Sending «Yes»…");
  assert.equal(replyStatus({ kind: "sent", option: "Not now", delivery: "sent", at: 0 }, 30_000), "Sent «Not now» · just now");
  assert.equal(replyStatus({ kind: "sent", option: "Not now", delivery: "sent", at: 0 }, 2 * 60 * 60_000), "Sent «Not now» · 2h ago");
  assert.equal(replyStatus({ kind: "sent", option: "Yes", delivery: "queued", at: 0 }, 5 * 60_000), "Sent «Yes», queued behind the orchestrator's turn · 5m ago");
  assert.equal(replyStatus({ kind: "sent", option: "Yes", delivery: "already", at: 0 }, 5 * 60_000), "«Yes» was already sent · 5m ago");
});
