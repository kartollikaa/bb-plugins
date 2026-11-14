import { useEffect, useMemo, useState } from "react";
import { experimental_useRpcKeyedQuery, experimental_useRpcQuery, experimental_useSidebarThreads } from "@get-bb/plugin-sdk/app";
import { contract } from "./contract.ts";
import { buildView, type LiveThread, type View } from "./view.ts";

const SNAPSHOT_REFRESH_MS = 20_000;
const MEMBERSHIP_REFRESH_MS = 60_000;
const CLOCK_MS = 30_000;

/** Calls `tick` every `ms` while the page is visible, and once when it becomes visible again. */
function useVisibleInterval(tick: () => void, ms: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick, ms, enabled]);
}

/** A thread is an orchestrator when a ledger's first line names it. */
export function useIsOrchestrator(threadId: string): boolean {
  const keys = useMemo(() => [threadId], [threadId]);
  const query = experimental_useRpcKeyedQuery({ contract, method: "isOrchestrator", keys });
  useVisibleInterval(query.refetch, MEMBERSHIP_REFRESH_MS);
  return query.data?.[threadId] === true;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useVisibleInterval(() => setNow(Date.now()), CLOCK_MS);
  return now;
}

export type OrchestrationState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "error"; message: string; retry: () => void }
  | { kind: "ready"; view: View; threadIds: Record<string, string> };

export function useOrchestration(threadId: string, enabled: boolean): OrchestrationState {
  const query = experimental_useRpcQuery({ contract, method: "snapshot", input: { threadId }, enabled });
  useVisibleInterval(query.refetch, SNAPSHOT_REFRESH_MS, enabled);
  const sidebar = experimental_useSidebarThreads();
  const now = useNow();

  const live = useMemo(() => {
    const map: Record<string, LiveThread> = {};
    for (const thread of sidebar.threads) {
      map[thread.id] = {
        status: thread.status,
        hasPendingInteraction: thread.hasPendingInteraction,
        latestAttentionAt: thread.latestAttentionAt,
        createdAt: thread.createdAt,
      };
    }
    return map;
  }, [sidebar.threads]);

  return useMemo<OrchestrationState>(() => {
    const data = query.data;
    if (!data) {
      if (query.error) return { kind: "error", message: query.error.message, retry: () => void query.refetch() };
      return { kind: "loading" };
    }
    if (data.state === "none") return { kind: "none" };
    if (data.state === "error") return { kind: "error", message: data.message, retry: () => void query.refetch() };
    const view = buildView({ ledger: data.ledger, agents: data.agents, live, orchestratorThreadId: threadId, now: Math.max(now, data.readAt) });
    const threadIds = Object.fromEntries(data.ledger.subtasks.flatMap((s) => (s.threadId ? [[s.id, s.threadId]] : [])));
    return { kind: "ready", view, threadIds };
  }, [query.data, query.error, query.refetch, live, threadId, now]);
}
