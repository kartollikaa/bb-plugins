import { test } from "node:test";
import assert from "node:assert/strict";
import { githubFolderAbsent, githubFolderPrPath, prOpenTarget } from "../src/githubFolder.ts";

test("only github.com PRs have a GitHub Folder page; others open their own URL", () => {
  assert.equal(githubFolderPrPath("https://github.com/o/r/pull/12"), "/plugins/github-folder/pr/o/r/12");
  assert.equal(githubFolderPrPath("https://github.example.com/o/r/pull/12"), null);
});

test("only a missing GitHub Folder reads as absent; a transient failure leaves the folder unloaded", () => {
  assert.equal(githubFolderAbsent(Object.assign(new Error("unknown plugin"), { code: "not_found" })), true);
  assert.equal(githubFolderAbsent(Object.assign(new Error("no method"), { code: "unknown_method" })), true);
  assert.equal(githubFolderAbsent(Object.assign(new Error("timeout"), { code: "transport_error" })), false);
  assert.equal(githubFolderAbsent(Object.assign(new Error("boom"), { code: "handler_error" })), false);
  assert.equal(githubFolderAbsent(new Error("socket hang up")), false);
});

test("a github.com PR opens in GitHub Folder whatever the host's case; other http(s) PRs open a tab; anything else nothing", () => {
  assert.deepEqual(prOpenTarget("https://GitHub.com/o/r/pull/12"), { kind: "folder", path: "/plugins/github-folder/pr/o/r/12" });
  assert.deepEqual(prOpenTarget("https://www.github.com/o/r/pull/12"), { kind: "folder", path: "/plugins/github-folder/pr/o/r/12" });
  assert.deepEqual(prOpenTarget("https://github.example.com/o/r/pull/12"), { kind: "tab", url: "https://github.example.com/o/r/pull/12" });
  assert.deepEqual(prOpenTarget("http://git.local/o/r/pull/12"), { kind: "tab", url: "http://git.local/o/r/pull/12" });
  assert.equal(prOpenTarget("javascript:alert(1)"), null);
  assert.equal(prOpenTarget("not a url"), null);
});
