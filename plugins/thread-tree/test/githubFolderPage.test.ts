import { test } from "node:test";
import assert from "node:assert/strict";
import { githubFolderPrPath } from "../src/githubFolder.ts";

test("only github.com PRs have a GitHub Folder page; others open their own URL", () => {
  assert.equal(githubFolderPrPath("https://github.com/o/r/pull/12"), "/plugins/github-folder/pr/o/r/12");
  assert.equal(githubFolderPrPath("https://github.example.com/o/r/pull/12"), null);
});
