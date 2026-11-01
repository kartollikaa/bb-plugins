import { useCallback, useEffect, useRef, useState } from "react";
import { useRpc, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server";
import type { Subagent } from "./subagents";

export interface ThreadSubagents {
  total: number;
  subagents: Subagent[];
}

const POLL_MS = 4_000;
const BATCH = 200;

function hasLiveWork(thread: PluginSidebarThread, known: ThreadSubagents | undefined): boolean {
  if (thread.status === "active" || thread.status === "starting") return true;
  if (thread.activity.backgroundAgents > 0) return true;
  return known?.subagents.some((agent) => agent.state === "running") ?? false;
}

/**
 * Subagents for the rows on screen. A row is fetched once, again whenever its
 * thread's `updatedAt` moves, and every few seconds while it has live work.
 */
export function useSubagents(rows: readonly PluginSidebarThread[]): ReadonlyMap<string, ThreadSubagents> {
  const rpc = useRpc<typeof rpcContract>();
  const [byThread, setByThread] = useState<ReadonlyMap<string, ThreadSubagents>>(() => new Map());
  const byThreadRef = useRef(byThread);
  byThreadRef.current = byThread;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const fetchedAt = useRef(new Map<string, number>());
  const inFlight = useRef(new Set<string>());

  const load = useCallback(
    async (threads: readonly PluginSidebarThread[]) => {
      const ids = threads.map((thread) => thread.id).filter((id) => !inFlight.current.has(id));
      if (ids.length === 0) return;
      for (const id of ids) inFlight.current.add(id);
      const stamps = new Map(threads.map((thread) => [thread.id, thread.updatedAt]));
      try {
        for (let start = 0; start < ids.length; start += BATCH) {
          const chunk = ids.slice(start, start + BATCH);
          const result = await rpc.call("subagents", { threadIds: chunk });
          for (const id of chunk) fetchedAt.current.set(id, stamps.get(id) ?? 0);
          setByThread((previous) => {
            const next = new Map(previous);
            for (const entry of result.threads) {
              next.set(entry.threadId, { total: entry.total, subagents: entry.subagents });
            }
            return next;
          });
        }
      } catch {
        // A failed read retries on the next poll or update.
      } finally {
        for (const id of ids) inFlight.current.delete(id);
      }
    },
    [rpc],
  );

  useEffect(() => {
    const stale = rows.filter((thread) => fetchedAt.current.get(thread.id) !== thread.updatedAt);
    if (stale.length > 0) void load(stale);
  }, [rows, load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const live = rowsRef.current.filter((thread) => hasLiveWork(thread, byThreadRef.current.get(thread.id)));
      if (live.length > 0) void load(live);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return byThread;
}
