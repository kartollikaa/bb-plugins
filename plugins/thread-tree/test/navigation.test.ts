import { test } from "node:test";
import assert from "node:assert/strict";
import { openThread } from "../src/navigation.ts";

test("without a workspace handler, thread requests preserve normal and split navigation", () => {
  const opened: unknown[] = [];
  const navigate = { toThread: (...args: unknown[]) => { opened.push(args); } };
  const events = new EventTarget();
  openThread(navigate, "thr_plain", false, events);
  openThread(navigate, "thr_split", true, events);
  assert.deepEqual(opened, [["thr_plain", { split: false }], ["thr_split", { split: true }]]);
});

test("an optional workspace handler takes over before a normal chat is opened", () => {
  const opened: string[] = [];
  const events = new EventTarget();
  events.addEventListener("thread-tree:open-thread", (event) => {
    const { threadId, split } = (event as CustomEvent).detail;
    if (threadId === "thr_owner" && !split) { opened.push("workspace"); event.preventDefault(); }
  });
  const navigate = { toThread: (id: string) => { opened.push(id); } };
  openThread(navigate, "thr_owner", false, events);
  openThread(navigate, "thr_plain", false, events);
  openThread(navigate, "thr_owner", true, events);
  assert.deepEqual(opened, ["workspace", "thr_plain", "thr_owner"]);
});
