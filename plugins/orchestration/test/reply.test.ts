import { test } from "node:test";
import assert from "node:assert/strict";
import { createReplyTracker, quickReplies, replyDraft, replySender, type Delivery } from "../src/reply.ts";

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

test("a double click sends one message", async () => {
  const fake = fakeSend("queued");
  const reply = replySender(fake.send, { windowMs: 60_000, now: () => 0 });
  const a = reply("thr_o", "Re «X»: Yes");
  const b = reply("thr_o", "Re «X»: Yes");
  fake.release();
  assert.deepEqual(await Promise.all([a, b]), ["queued", "queued"]);
  assert.equal(fake.calls.length, 1);
});

test("a repeat inside the window does not send again; after it, it does", async () => {
  let t = 0;
  const fake = fakeSend("sent");
  fake.release();
  const reply = replySender(fake.send, { windowMs: 1_000, now: () => t });
  await reply("thr_o", "Re «X»: Yes");
  t = 999;
  await reply("thr_o", "Re «X»: Yes");
  assert.equal(fake.calls.length, 1);
  t = 1_001;
  await reply("thr_o", "Re «X»: Yes");
  assert.equal(fake.calls.length, 2);
});

test("different options or threads are separate messages", async () => {
  const fake = fakeSend("sent");
  fake.release();
  const reply = replySender(fake.send, { windowMs: 60_000, now: () => 0 });
  await reply("thr_o", "Re «X»: Yes");
  await reply("thr_o", "Re «X»: No");
  await reply("thr_p", "Re «X»: Yes");
  assert.equal(fake.calls.length, 3);
});

test("a failed send can be retried", async () => {
  const failing = fakeSend(new Error("offline"));
  failing.release();
  const reply = replySender(failing.send, { windowMs: 60_000, now: () => 0 });
  await assert.rejects(reply("thr_o", "Re «X»: Yes"), /offline/);
  await assert.rejects(reply("thr_o", "Re «X»: Yes"), /offline/);
  assert.equal(failing.calls.length, 2);
});

test("the tracker lets one click through per card and keeps the sent state", () => {
  const tracker = createReplyTracker();
  assert.equal(tracker.begin("thr_o", "ask-1", "Merge it"), true);
  assert.equal(tracker.begin("thr_o", "ask-1", "Not now"), false);
  assert.deepEqual(tracker.get("thr_o", "ask-1"), { kind: "sending", option: "Merge it" });
  tracker.done("thr_o", "ask-1", "queued");
  assert.deepEqual(tracker.get("thr_o", "ask-1"), { kind: "sent", option: "Merge it", delivery: "queued" });
  assert.equal(tracker.begin("thr_o", "ask-1", "Merge it"), false);
});

test("a failure frees the card for another click", () => {
  const tracker = createReplyTracker();
  tracker.begin("thr_o", "ask-1", "Merge it");
  tracker.fail("thr_o", "ask-1");
  assert.equal(tracker.get("thr_o", "ask-1"), null);
  assert.equal(tracker.begin("thr_o", "ask-1", "Not now"), true);
});

test("the sent state goes once the ledger drops the ask, only for that orchestrator", () => {
  const tracker = createReplyTracker();
  tracker.begin("thr_o", "ask-1", "Merge it");
  tracker.done("thr_o", "ask-1", "sent");
  tracker.begin("thr_o", "ask-2", "Yes");
  tracker.begin("thr_p", "ask-1", "Yes");
  tracker.prune("thr_o", ["ask-2"]);
  assert.equal(tracker.get("thr_o", "ask-1"), null);
  assert.notEqual(tracker.get("thr_o", "ask-2"), null);
  assert.notEqual(tracker.get("thr_p", "ask-1"), null);
});

test("subscribers hear every change", () => {
  const tracker = createReplyTracker();
  let heard = 0;
  const off = tracker.subscribe(() => heard++);
  tracker.begin("thr_o", "a", "x");
  tracker.done("thr_o", "a", "sent");
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
  const first = createReplyTracker(storage);
  first.begin("thr_o", "ask-1", "Merge it");
  first.done("thr_o", "ask-1", "queued");
  first.begin("thr_o", "ask-2", "Yes");
  const reloaded = createReplyTracker(storage);
  assert.deepEqual(reloaded.get("thr_o", "ask-1"), { kind: "sent", option: "Merge it", delivery: "queued" });
  assert.equal(reloaded.get("thr_o", "ask-2"), null);
  reloaded.prune("thr_o", []);
  assert.equal(createReplyTracker(storage).get("thr_o", "ask-1"), null);
});

test("unreadable or throwing storage leaves the tracker in memory", () => {
  const broken = { getItem: () => "{not json", setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
  const tracker = createReplyTracker(broken);
  assert.equal(tracker.begin("thr_o", "a", "x"), true);
  tracker.done("thr_o", "a", "sent");
  assert.deepEqual(tracker.get("thr_o", "a"), { kind: "sent", option: "x", delivery: "sent" });
});
