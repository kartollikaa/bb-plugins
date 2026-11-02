import assert from "node:assert/strict";
import { test } from "node:test";
import { hrefToPath, reveal } from "../server.ts";

test("file URLs decode to absolute paths", () => {
  assert.equal(hrefToPath("file:///Users/me/My%20Files/a.apk"), "/Users/me/My Files/a.apk");
  assert.equal(hrefToPath("/tmp/../tmp/x"), "/tmp/x");
});

test("relative paths, foreign schemes and NUL are refused", () => {
  assert.equal(hrefToPath("docs/x.md"), null);
  assert.equal(hrefToPath("https://example.com/x"), null);
  assert.equal(hrefToPath("file:///tmp/a%00b"), null);
});

test("an existing path is revealed, a missing one is not", async () => {
  const seen: string[] = [];
  const run = async (path: string) => { seen.push(path); };
  assert.deepEqual(await reveal("file:///tmp", run, "darwin"), { ok: true, path: "/tmp" });
  assert.deepEqual(await reveal("file:///tmp/no-such-file-42", run, "darwin"), { ok: false, reason: "File not found" });
  assert.deepEqual(await reveal("file:///tmp", run, "linux"), { ok: false, reason: "Finder exists only on macOS" });
  assert.deepEqual(seen, ["/tmp"]);
});
