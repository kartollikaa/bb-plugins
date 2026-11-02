import assert from "node:assert/strict";
import { homedir } from "node:os";
import { test } from "node:test";
import { openArgs, toAbsolutePath } from "../server.ts";

test("file URLs, home paths and absolute paths resolve", () => {
  assert.equal(toAbsolutePath("file:///Users/me/My%20Files/a.apk", null), "/Users/me/My Files/a.apk");
  assert.equal(toAbsolutePath("~/Downloads/x.zip", null), `${homedir()}/Downloads/x.zip`);
  assert.equal(toAbsolutePath("/tmp/../tmp/x", null), "/tmp/x");
});

test("relative paths need a worktree", () => {
  assert.equal(toAbsolutePath("docs/x.md", null), null);
  assert.equal(toAbsolutePath("docs/x.md", "/work/repo"), "/work/repo/docs/x.md");
});

test("foreign schemes and NUL are refused", () => {
  assert.equal(toAbsolutePath("https://example.com/x", null), null);
  assert.equal(toAbsolutePath("file:///tmp/a%00b", null), null);
});

test("Finder reveals, the default app opens", () => {
  assert.deepEqual(openArgs("/tmp/a", "finder"), ["-R", "/tmp/a"]);
  assert.deepEqual(openArgs("/tmp/a", "default"), ["/tmp/a"]);
});
