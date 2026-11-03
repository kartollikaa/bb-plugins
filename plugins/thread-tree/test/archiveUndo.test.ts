import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_BATCH_GAP_MS,
  ARCHIVE_UNDO_WINDOW_MS,
  archiveIsNewerThanTyping,
  createArchiveHistory,
  isUndoKey,
  removedThreadIds,
} from "../src/archiveUndo.ts";

function clock(start = 1_000_000) {
  let time = start;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

const ids = (batch: ReturnType<ReturnType<typeof createArchiveHistory>["takeLatestBatch"]>) =>
  batch?.threads.map((thread) => thread.threadId) ?? null;

test("nothing archived, nothing to undo", () => {
  assert.equal(createArchiveHistory().takeLatestBatch(), null);
});

test("each undo restores the previous separate archive", () => {
  const c = clock();
  const history = createArchiveHistory(c.now);
  history.record("a", "A");
  c.advance(ARCHIVE_BATCH_GAP_MS + 1);
  history.record("b", "B");
  assert.deepEqual(ids(history.takeLatestBatch()), ["b"]);
  assert.deepEqual(ids(history.takeLatestBatch()), ["a"]);
  assert.equal(history.takeLatestBatch(), null);
});

test("a parent and the children archived with it come back together, newest first", () => {
  const c = clock();
  const history = createArchiveHistory(c.now);
  history.record("old", "Old");
  c.advance(ARCHIVE_BATCH_GAP_MS * 5);
  history.record("kid1", "Kid 1");
  c.advance(10);
  history.record("kid2", "Kid 2");
  c.advance(10);
  history.record("parent", "Parent");
  assert.deepEqual(ids(history.takeLatestBatch()), ["parent", "kid2", "kid1"]);
  assert.deepEqual(ids(history.takeLatestBatch()), ["old"]);
});

test("a thread restored some other way is not restored again", () => {
  const history = createArchiveHistory(clock().now);
  history.record("a", "A");
  history.forget("a");
  assert.equal(history.takeLatestBatch(), null);
});

test("archives older than the undo window expire", () => {
  const c = clock();
  const history = createArchiveHistory(c.now);
  history.record("a", "A");
  c.advance(ARCHIVE_UNDO_WINDOW_MS + 1);
  assert.equal(history.takeLatestBatch(), null);
});

test("re-archiving a thread keeps one entry, at its latest time", () => {
  const c = clock();
  const history = createArchiveHistory(c.now);
  history.record("a", "A");
  c.advance(ARCHIVE_BATCH_GAP_MS + 1);
  history.record("b", "B");
  c.advance(ARCHIVE_BATCH_GAP_MS + 1);
  history.record("a", "A");
  assert.deepEqual(ids(history.takeLatestBatch()), ["a"]);
  assert.deepEqual(ids(history.takeLatestBatch()), ["b"]);
  assert.equal(history.takeLatestBatch(), null);
});

test("undo key is Cmd+Z or Ctrl+Z, not redo", () => {
  const key = { key: "z", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(isUndoKey({ ...key, ctrlKey: true }), true);
  assert.equal(isUndoKey({ ...key, metaKey: true }), true);
  assert.equal(isUndoKey({ ...key, key: "Z", metaKey: true }), true);
  assert.equal(isUndoKey({ ...key, metaKey: true, shiftKey: true }), false);
  assert.equal(isUndoKey({ ...key, ctrlKey: true, altKey: true }), false);
  assert.equal(isUndoKey(key), false);
  assert.equal(isUndoKey({ ...key, key: "y", ctrlKey: true }), false);
});

test("threads that left the active list are reported, new ones are not", () => {
  assert.deepEqual(removedThreadIds(new Set(["a", "b", "c"]), ["a", "c", "d"]), ["b"]);
  assert.deepEqual(removedThreadIds(new Set(), ["a"]), []);
});

test("in a text field the archive wins only when nothing was typed after it", () => {
  assert.equal(archiveIsNewerThanTyping(undefined, 0), false);
  assert.equal(archiveIsNewerThanTyping(200, 100), true);
  assert.equal(archiveIsNewerThanTyping(100, 200), false);
});
