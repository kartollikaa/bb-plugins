import { createHash } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract, hostContract, hostSignals } from "./contracts.ts";
import { configSchema, type Binding, type Snapshot } from "./schema.ts";
import { Consent } from "./policy.ts";
export { rpcContract };
export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({
    contract: hostContract,
    experimental_signals: hostSignals,
  });
  const settings = bb.settings.define({
    durationMinutes: {
      type: "number",
      label: "Live duration (1–60 minutes)",
      default: 10,
    },
  });
  type Entry = {
    binding: Binding;
    hostId: string;
    root: string;
    key: string;
    consent: Consent;
    snapshot: Snapshot;
    queue: Promise<unknown>;
    watchError: string | null;
  };
  const entries = new Map<string, Entry>();
  let disposed = false;
  const keyOf = (b: Binding) =>
    createHash("sha256").update(JSON.stringify(b)).digest("hex");
  const invalidate = (e: Entry) =>
    bb.rpc.experimental_invalidate([JSON.stringify(e.binding)]);
  async function resolve(b: Binding) {
    const t = await bb.sdk.threads.get({ threadId: b.threadId });
    if (t.archivedAt !== null || t.deletedAt !== null)
      throw new Error("Thread is archived or deleted");
    const env = t.environmentId
      ? await bb.sdk.environments.get({ environmentId: t.environmentId })
      : null;
    if (
      env &&
      (env.lifecycle.phase !== "active" || env.hostLifecycle !== "active")
    )
      throw new Error("Environment access revoked");
    if (b.config.source.root === "workspace") {
      if (!env?.path) throw new Error("Workspace unavailable");
      return {
        hostId: env.hostId,
        root: env.path,
        environmentId: t.environmentId,
      };
    }
    const loc = await bb.sdk.threads.storageLocation({ threadId: b.threadId });
    return {
      hostId: loc.hostId,
      root: loc.storageRootPath,
      environmentId: t.environmentId,
    };
  }
  async function getEntry(b: Binding) {
    const key = keyOf(b);
    let e = entries.get(key);
    try {
      const scope = await resolve(b),
        identity = JSON.stringify(scope);
      if (e && e.snapshot.identity !== identity) {
        await revoke(e);
        entries.delete(key);
        e = undefined;
      }
      if (!e) {
        if (entries.size >= 128)
          throw new Error(
            "Too many active blocks; reload the plugin to clear paused blocks",
          );
        const cfg = await settings.get(),
          duration = Math.max(
            1,
            Math.min(60, Number(cfg.durationMinutes) || 10),
          );
        e = {
          binding: b,
          ...scope,
          key,
          consent: new Consent(),
          queue: Promise.resolve(),
          watchError: null,
          snapshot: {
            report: null,
            readAt: null,
            revision: null,
            error: null,
            revoked: false,
            live: false,
            expiresAt: null,
            identity,
            durationMinutes: duration,
            leaseSeconds: 45,
          },
        };
        entries.set(key, e);
      }
      return e;
    } catch (err) {
      if (e) await revoke(e);
      throw err;
    }
  }
  const pending = new Map<string, Promise<Entry>>();
  function get(b: Binding): Promise<Entry> {
    const key = keyOf(b),
      existing = pending.get(key);
    if (existing) return existing;
    const task = getEntry(b).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  async function stop(e: Entry) {
    await host
      .call("stop", { key: e.key }, { hostId: e.hostId })
      .catch(() => {});
  }
  async function revoke(e: Entry) {
    if (e.snapshot.revoked && !e.snapshot.live && e.snapshot.report === null)
      return;
    e.consent.revoke();
    e.snapshot = {
      ...e.snapshot,
      report: null,
      readAt: null,
      revision: null,
      revoked: true,
      error: "Source access revoked",
      live: false,
    };
    await stop(e);
    invalidate(e);
  }
  async function update(e: Entry, read: boolean) {
    if (disposed) return e.snapshot;
    try {
      const scope = await resolve(e.binding).catch(async () => {
        await revoke(e);
        return null;
      });
      if (!scope) return { ...e.snapshot };
      if (JSON.stringify(scope) !== e.snapshot.identity) {
        await revoke(e);
        return e.snapshot;
      }
      e.snapshot.live = e.consent.live();
      e.snapshot.expiresAt = e.consent.expiresAt || null;
      if (read) {
        const r = await host.call(
          "read",
          {
            key: e.key,
            root: e.root,
            path: e.binding.config.source.path,
            until: 0,
          },
          { hostId: e.hostId },
        );
        if (r.revoked) {
          await revoke(e);
          return e.snapshot;
        }
        if (r.report) e.snapshot = { ...e.snapshot, ...r, readAt: Date.now() };
        else e.snapshot.error = r.error;
        if (r.error === "Source removed") {
          e.consent.revoke();
          e.snapshot.live = false;
        }
      }
      if (e.consent.live())
        await host.call(
          "watch",
          {
            key: e.key,
            root: e.root,
            path: e.binding.config.source.path,
            until: Math.min(
              e.consent.expiresAt,
              Math.max(...e.consent.clients.values()),
            ),
          },
          { hostId: e.hostId },
        );
      else await stop(e);
    } catch {
      e.snapshot.error = "Host or source unavailable; Live paused";
      e.consent.revoke();
      e.snapshot.live = false;
      await stop(e);
    }
    if (e.watchError) e.snapshot.error = e.watchError;
    return { ...e.snapshot };
  }
  function serial<T>(e: Entry, fn: () => Promise<T>): Promise<T> {
    const task = e.queue.then(fn, fn);
    e.queue = task.catch(() => {});
    return task;
  }
  bb.rpc.register(rpcContract, {
    snapshot: async (b) => {
      const e = await get(b);
      return serial(e, () => update(e, true));
    },
    control: async ({ binding, client, action }) => {
      const e = await get(binding);
      return serial(e, async () => {
        if (action === "mount") {
          const marker = `mounted:${e.key}:${createHash("sha256").update(e.snapshot.identity).digest("hex")}`;
          if (e.consent.live()) {
            e.consent.resume(client, e.snapshot.durationMinutes * 60000, 45000);
          } else if (!(await bb.storage.kv.get<boolean>(marker))) {
            await bb.storage.kv.set(marker, true);
            e.consent.resume(client, e.snapshot.durationMinutes * 60000, 45000);
          }
        }
        if (action === "resume") {
          e.watchError = null;
          e.consent.resume(client, e.snapshot.durationMinutes * 60000, 45000);
        }
        if (action === "heartbeat") e.consent.heartbeat(client, 45000);
        if (action === "pause") e.consent.pause(client);
        const result = await update(
          e,
          action === "refresh" || action === "resume" || action === "mount",
        );
        if (action !== "heartbeat") invalidate(e);
        return result;
      });
    },
  });
  const off = host.experimental_onSignal("changed", ({ hostId, payload }) => {
    const e = entries.get(payload.key);
    if (e && e.hostId === hostId && e.consent.live())
      void serial(e, async () => {
        if (!e.consent.live()) return;
        if (payload.failed) {
          e.consent.revoke();
          e.watchError = "Native watcher failed; Resume to retry";
        }
        await update(e, true);
        invalidate(e);
      });
  });
  const exit = host.experimental_onWorkerExit(({ hostId }) => {
    for (const e of entries.values())
      if (e.hostId === hostId) {
        e.consent.revoke();
        e.snapshot.live = false;
        e.snapshot.error = "Host disconnected; Resume to reconnect";
        invalidate(e);
      }
  });
  for (const event of ["thread.archived", "thread.deleted"] as const)
    bb.events.on(event, async ({ thread }) => {
      for (const e of entries.values())
        if (e.binding.threadId === thread.id) await serial(e, () => revoke(e));
    });
  const timer = setInterval(() => {
    for (const e of entries.values())
      if (!e.consent.live() && e.snapshot.live)
        void serial(e, async () => {
          e.snapshot.live = false;
          await stop(e);
          invalidate(e);
        });
  }, 1000);
  bb.onDispose(async () => {
    disposed = true;
    clearInterval(timer);
    off();
    exit();
    await Promise.all([...entries.values()].map(stop));
    entries.clear();
  });
  bb.cli.register({
    name: "live-ui",
    summary: "Validate Live UI JSON configuration",
    commands: [
      {
        name: "status",
        summary: "Inspect active live blocks and host watcher counts",
        usage: "bb live-ui status",
      },
      {
        name: "check",
        summary: "Validate a JSON fence body",
        usage: "bb live-ui check <json>",
      },
    ],
    async run(args) {
      if (args[0] === "status") {
        const hosts = [...new Set([...entries.values()].map((e) => e.hostId))];
        const results = await Promise.all(
          hosts.map(async (hostId) => ({
            hostId,
            ...(await host.call("status", null, { hostId })),
          })),
        );
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            liveBlocks: [...entries.values()].filter((e) => e.consent.live())
              .length,
            hosts: results,
          }),
        };
      }
      if (args[0] !== "check")
        return {
          exitCode: 0,
          stdout:
            "bb live-ui check <json> — syntax and examples: skills/live-ui/SKILL.md",
        };
      try {
        const c = configSchema.parse(JSON.parse(args[1] ?? ""));
        return { exitCode: 0, stdout: JSON.stringify(c) };
      } catch {
        return {
          exitCode: 1,
          stderr:
            "Invalid Live UI config. Use source.root (workspace/storage), relative source.path, and view (Metric/Table/Chart/Pipeline).",
        };
      }
    },
  });
}
