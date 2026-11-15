import { test } from "node:test";
import assert from "node:assert/strict";
import { reportOf } from "../src/report.ts";

test("reports preserve Markdown and mark shortening without breaking Unicode", () => {
  assert.equal(reportOf(null), null);
  assert.equal(reportOf("  "), null);
  assert.deepEqual(reportOf(" # Result\n- [Evidence](/tmp/result.md) "), { text: "# Result\n- [Evidence](/tmp/result.md)", truncated: false });
  const text = "😀".repeat(16_001);
  assert.deepEqual(reportOf(text), { text: "😀".repeat(16_000), truncated: true });
});
