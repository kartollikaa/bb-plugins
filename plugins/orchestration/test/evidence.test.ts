import { test } from "node:test";
import assert from "node:assert/strict";
import { localEvidencePath } from "../src/evidence.ts";

test("evidence destinations resolve from their actual source document", () => {
  assert.equal(localEvidencePath("history/review.md", "/state/run.md"), "/state/history/review.md");
  assert.equal(localEvidencePath("../result%20brief.md", "/state/history/gate.md"), "/state/result brief.md");
  assert.equal(localEvidencePath("/results/final.md", "/workspace/"), "/results/final.md");
  assert.equal(localEvidencePath("file:///results/final.md", "/workspace/"), "/results/final.md");
  assert.equal(localEvidencePath("result.md", "/workspace/"), "/workspace/result.md");
});

test("web links and fragment navigation do not turn into local file access", () => {
  for (const href of ["https://example.com/review", "javascript:alert(1)", "data:text/html,hello", "#evidence", "//remote/result.md", "file://remote/result.md", "%00secret"])
    assert.equal(localEvidencePath(href, "/state/run.md"), null);
});
