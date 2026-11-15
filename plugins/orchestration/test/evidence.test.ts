import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceTarget, localEvidencePath } from "../src/evidence.ts";

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


test("file identities prefer actual storage and workspace scopes, with no prefix collisions", () => {
  const workspace = { environmentId: "env_test", rootPath: "/workspace", storageRootPath: "/storage/thread" };
  assert.deepEqual(evidenceTarget("/storage/thread/result.md", "host_test", "thr_test", workspace), { kind: "thread-storage", threadId: "thr_test", path: "result.md" });
  assert.deepEqual(evidenceTarget("/workspace/report.md", "host_test", "thr_test", workspace), { kind: "workspace", environmentId: "env_test", path: "report.md" });
  assert.deepEqual(evidenceTarget("/state/history.md", "host_test", "thr_test", workspace), { kind: "host", hostId: "host_test", path: "/state/history.md" });
  assert.equal(evidenceTarget("/workspace-other/report.md", null, "thr_test", workspace), null);
});
