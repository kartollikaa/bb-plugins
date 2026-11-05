import assert from "node:assert/strict";
import { test } from "node:test";
import { numberDuplicates, threadIdFromPath } from "../lib/card.ts";

test("the thread id comes from a thread route only", () => {
  assert.equal(threadIdFromPath("/projects/p1/threads/thr_abc"), "thr_abc");
  assert.equal(threadIdFromPath("/projects/p1/threads/thr_abc/"), "thr_abc");
  assert.equal(threadIdFromPath("/projects/p1"), null);
  assert.equal(threadIdFromPath("/settings"), null);
});

test("rows with the same description are numbered in card order", () => {
  const rows = numberDuplicates([{ description: "a" }, { description: "b" }, { description: "a" }]);
  assert.deepEqual(
    rows.map((row) => row.index),
    [0, 0, 1],
  );
});
