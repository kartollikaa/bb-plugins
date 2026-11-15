import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "../server.ts";
const binding = {
  threadId: "t",
  messageId: "m",
  index: 0,
  config: {
    source: { root: "storage" as const, path: "r.json" },
    view: "Metric" as const,
  },
};
test("server consent, stale snapshots, scoped reads, archive, revocation and disposal", async () => {
  let broken = false,
    revoked = false,
    archived = false,
    reads = 0;
  let delayRead: Promise<void> | null = null;
  const calls: { method: string; input: unknown; hostId: string }[] = [];
  let { bb, harness } = createFakePluginHost({
    pluginId: "live-ui",
    sdk: {
      threads: {
        get: async () =>
          makeThreadResponse({
            id: "t",
            environmentId: null,
            archivedAt: archived ? 1 : null,
          }),
        storageLocation: async () => ({
          hostId: "host",
          storageRootPath: "/approved",
        }),
      },
    },
    experimental_callHostRpc: async (call) => {
      calls.push(call);
      if (call.method === "read") {
        reads++;
        if (delayRead) await delayRead;
        return {
          report:
            broken || revoked
              ? null
              : { metrics: [{ label: "Count", value: 7 }] },
          revision: broken || revoked ? null : "v1",
          error: revoked
            ? "Source access denied"
            : broken
              ? "Invalid or partial JSON"
              : null,
          revoked,
        };
      }
      return true;
    },
  });
  try {
    await plugin(bb);
    const invoke = (
      action: string,
      client = "00000000-0000-4000-8000-000000000001",
      b = binding,
    ) =>
      harness.behavior.callRpc("control", {
        binding: b,
        client,
        action,
      }) as Promise<any>;
    let s = (await harness.behavior.callRpc("snapshot", binding)) as any;
    assert.equal(s.live, false);
    assert.equal(calls.filter((c) => c.method === "watch").length, 0);
    assert.equal(s.report.metrics[0].value, 7);
    s = await invoke("mount");
    assert.equal(s.live, true);
    const secondClient = "00000000-0000-4000-8000-000000000002";
    const originalDeadline = s.expiresAt;
    s = await invoke("mount", secondClient);
    assert.equal(s.expiresAt, originalDeadline);
    s = await invoke("pause");
    assert.equal(s.live, true);
    s = await invoke("pause", secondClient);
    assert.equal(s.live, false);
    s = await invoke("mount");
    assert.equal(s.live, false);
    ({ bb, harness } = await harness.lifecycle.reload(plugin));
    s = await invoke("mount");
    assert.equal(s.live, false);
    s = await invoke("resume");
    assert.equal(s.live, true);
    const key = (
      calls.find((c) => c.method === "watch")!.input as { key: string }
    ).key;
    let release!: () => void;
    delayRead = new Promise<void>((r) => {
      release = r;
    });
    const readsBeforePause = reads;
    const slow = invoke("refresh");
    await new Promise((r) => setImmediate(r));
    const pausing = invoke("pause");
    await new Promise((r) => setImmediate(r));
    await harness.behavior.experimental_emitHostSignal("host", "changed", {
      key,
      failed: false,
    });
    delayRead = null;
    release();
    await slow;
    await pausing;
    await new Promise((r) => setImmediate(r));
    assert.equal(reads, readsBeforePause + 1);
    await invoke("resume");
    const positiveReads = reads;
    await harness.behavior.experimental_emitHostSignal("host", "changed", {
      key,
      failed: false,
    });
    await invoke("heartbeat");
    assert.equal(reads, positiveReads + 1);
    await harness.behavior.experimental_emitHostSignal("host", "changed", {
      key,
      failed: true,
    });
    await new Promise((r) => setImmediate(r));
    s = (await harness.behavior.callRpc("snapshot", binding)) as any;
    assert.equal(s.live, false);
    assert.match(s.error, /Native watcher failed/);
    s = await invoke("refresh");
    assert.match(s.error, /Native watcher failed/);
    s = await invoke("resume");
    assert.equal(s.error, null);
    assert.equal(s.live, true);
    const originalTime = s.readAt;
    assert.equal(calls.at(-1)?.method, "watch");
    const before = reads;
    await invoke("heartbeat");
    assert.equal(reads, before);
    broken = true;
    s = await invoke("refresh");
    assert.equal(s.report.metrics[0].value, 7);
    assert.equal(s.readAt, originalTime);
    assert.match(s.error, /partial/);
    const other = { ...binding, messageId: "different" };
    s = (await harness.behavior.callRpc("snapshot", other)) as any;
    assert.equal(s.live, false);
    revoked = true;
    s = await invoke("refresh");
    assert.equal(s.report, null);
    assert.equal(s.live, false);
    assert.equal(s.revoked, true);
    revoked = false;
    broken = false;
    await invoke("resume");
    archived = true;
    await harness.behavior.emitThreadEvent("thread.archived", {
      thread: makeThreadResponse({ id: "t", archivedAt: 1 }),
    });
    const stopsAfterArchive = calls.filter((c) => c.method === "stop").length;
    await assert.rejects(invoke("resume"));
    await assert.rejects(invoke("resume"));
    assert.equal(
      calls.filter((c) => c.method === "stop").length,
      stopsAfterArchive,
    );
    assert.equal(calls.at(-1)?.method, "stop");
  } finally {
    await harness.lifecycle.dispose();
  }
  assert.equal(
    calls.every((c) => c.hostId === "host"),
    true,
  );
});
