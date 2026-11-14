import { test } from "node:test";
import assert from "node:assert/strict";
import { withEntry } from "../src/usePersistentSet.ts";

test("snoozing an item again makes it the newest, so the store's cap drops older ones first", () => {
  assert.deepEqual(Object.keys(withEntry({ a: "1", b: "2" }, "a", "3")), ["b", "a"]);
  assert.deepEqual(withEntry({ a: "1", b: "2" }, "a", undefined), { b: "2" });
});
