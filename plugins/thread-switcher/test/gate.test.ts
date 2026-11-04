import assert from "node:assert/strict";
import { test } from "node:test";
import { isThreadRoute, pinchCanOpen, type Screen } from "../lib/gate.ts";

const chat: Screen = {
  pathname: "/projects/proj_1/threads/thr_1",
  threadListOpen: false,
  sidePanelOpen: false,
  overlayOpen: false,
  startScale: 1,
  scale: 1,
};

test("thread routes", () => {
  assert.equal(isThreadRoute("/projects/proj_1/threads/thr_1"), true);
  assert.equal(isThreadRoute("/projects/proj_1/threads/thr_1/"), true);
  assert.equal(isThreadRoute("/"), false);
  assert.equal(isThreadRoute("/settings"), false);
  assert.equal(isThreadRoute("/projects/proj_1"), false);
  assert.equal(isThreadRoute("/projects/proj_1/threads/thr_1/files"), false);
});

test("opens on a chat or over the thread list at normal zoom", () => {
  assert.equal(pinchCanOpen(chat), true);
  assert.equal(pinchCanOpen({ ...chat, pathname: "/settings", threadListOpen: true }), true);
});

test("stays shut elsewhere, when zoomed, or under a photo, dialog or side panel", () => {
  assert.equal(pinchCanOpen({ ...chat, pathname: "/" }), false);
  assert.equal(pinchCanOpen({ ...chat, pathname: "/settings" }), false);
  assert.equal(pinchCanOpen({ ...chat, startScale: 1.6 }), false, "zooming back out from a zoomed page");
  assert.equal(pinchCanOpen({ ...chat, scale: 1.3 }), false);
  assert.equal(pinchCanOpen({ ...chat, overlayOpen: true }), false);
  assert.equal(pinchCanOpen({ ...chat, sidePanelOpen: true }), false);
  assert.equal(pinchCanOpen({ ...chat, threadListOpen: true, overlayOpen: true }), false);
});
