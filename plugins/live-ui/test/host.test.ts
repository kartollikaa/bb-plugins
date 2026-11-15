import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import type { ExperimentalHostWatchListener } from "@get-bb/plugin-sdk";
import entry from "../host.ts";
test("native watches deduplicate, filter sibling events, rescan, fail closed and dispose", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "live-ui-host-")));
  await writeFile(join(root, "r.json"), "{}");
  let listener: ExperimentalHostWatchListener = () => {},
    opens = 0,
    closes = 0;
  const h = experimental_createHostEntryHarness(entry, {
    experimental_watch: async (o, l) => {
      assert.equal(o.rootPath, root);
      listener = l;
      opens++;
      return {
        dispose: async () => {
          closes++;
        },
      };
    },
  });
  try {
    const input = {
      key: "one",
      root,
      path: "r.json",
      until: Date.now() + 2000,
    };
    await h.experimental_call("watch", input);
    await h.experimental_call("watch", input);
    assert.equal(opens, 1);
    await listener({
      kind: "changed",
      changes: [{ path: join(root, "other"), type: "update" }],
    });
    assert.equal(h.experimental_getSignals().length, 0);
    await listener({
      kind: "changed",
      changes: [{ path: join(root, "r.json"), type: "create" }],
    });
    assert.equal(h.experimental_getSignals().length, 1);
    await listener({ kind: "rescan-required" });
    assert.equal(h.experimental_getSignals().length, 2);
    await listener({ kind: "watch-error", message: "unsupported" });
    assert.equal(closes, 1);
    assert.equal(h.experimental_getSignals().at(-1)?.payload.failed, true);
    await h.experimental_call("watch", input);
    assert.equal(opens, 2);
    await h.experimental_call("stop", { key: "one" });
    assert.equal(closes, 2);
    await assert.rejects(
      h.experimental_call("watch", { ...input, until: Date.now() - 1 }),
    );
    await h.experimental_call("watch", {
      ...input,
      key: "expiry",
      until: Date.now() + 40,
    });
    await new Promise((r) => setTimeout(r, 1050));
    assert.equal(closes, 3);
    await h.experimental_call("watch", {
      ...input,
      key: "dispose",
      until: Date.now() + 2000,
    });
  } finally {
    await h.experimental_dispose();
    await rm(root, { recursive: true, force: true });
  }
  assert.equal(opens, closes);
});
