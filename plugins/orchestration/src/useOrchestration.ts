import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { experimental_useRpcKeyedQuery, experimental_useRpcQuery, experimental_useSidebarThreads } from "@get-bb/plugin-sdk/app";
import { combineAnswers } from "./answered.ts";
import { contract } from "./contract.ts";
import type { LedgerSummary } from "./contract.ts";
import { createReplyTracker } from "./reply.ts";
import { localStore } from "./storage.ts";
import { orchestratorLookupKeys } from "./switch.ts";
import { buildView, type LiveThread, type View } from "./view.ts";
import { knownOwner, navigationOwners } from "./navigation.ts";

/** Quick replies this client sent, shared by the tab, the page and the context-card row. */
export const replies = createReplyTracker(localStore());

const SNAPSHOT_REFRESH_MS = 20_000;
const MEMBERSHIP_REFRESH_MS = 60_000;
const CLOCK_MS = 30_000;

export function useVisibleInterval(tick: () => void, ms: number, enabled = true) {
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

/** Null until the ledger lookup has answered for this thread. */
export function useOrchestratorMembership(threadId: string): boolean | null {
  const index = useOwnershipIndex();
  const keys = useMemo(() => orchestratorLookupKeys([threadId]), [threadId]);
  const query = experimental_useRpcKeyedQuery({ contract, method: "isOrchestrator", keys, enabled: keys.length > 0 && index.roots === null });
  useVisibleInterval(query.refetch, MEMBERSHIP_REFRESH_MS, index.roots === null);
  return index.roots ? index.roots.has(threadId) : query.data?.[threadId] ?? null;
}

export function useIsOrchestrator(threadId: string): boolean {
  return useOrchestratorMembership(threadId) === true;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  const tick = useCallback(() => setNow(Date.now()), []);
  useVisibleInterval(tick, CLOCK_MS);
  return now;
}

export type OrchestrationState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "error"; message: string; retry: () => void }
  | { kind: "ready"; view: View; ledger: LedgerSummary; report: { text: string; truncated: boolean } | null; workspace: { environmentId: string; rootPath: string; hostId: string; ledgerHostId: string | null } | null; threadIds: Record<string, string> };

export function useOrchestration(threadId: string, enabled: boolean): OrchestrationState {
  const query = experimental_useRpcQuery({ contract, method: "snapshot", input: { threadId }, enabled });
  useVisibleInterval(query.refetch, SNAPSHOT_REFRESH_MS, enabled);
  const sidebar = experimental_useSidebarThreads();
  const now = useNow();
  const repliesVersion = useSyncExternalStore(replies.subscribe, replies.version);

  const live = useMemo(() => {
    const map: Record<string, LiveThread> = {};
    for (const thread of sidebar.threads) {
      map[thread.id] = {
        status: thread.status,
        hasPendingInteraction: thread.hasPendingInteraction,
        latestAttentionAt: thread.latestAttentionAt,
        createdAt: thread.createdAt,
        parentThreadId: thread.parentThreadId,
        title: thread.displayTitle,
        hidden: thread.isHidden,
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
    const answered = combineAnswers(data.answered, replies.answers(threadId), data.askFirstSeen);
    const view = buildView({ ledger: data.ledger, agents: data.agents, live, orchestratorThreadId: threadId, now: Math.max(now, data.readAt), answered });
    return { kind: "ready", view, ledger: data.ledger, report: data.report ?? null, workspace: data.workspace ?? null, threadIds: view.threadIds };
  }, [query.data, query.error, query.refetch, live, threadId, now, repliesVersion]);
}

export function useOrchestrationOwner(threadId: string): string | null | undefined {
  const index = useOwnershipIndex();
  const indexed = index.owner(threadId);
  const known = indexed !== undefined ? indexed : navigationOwners.get(threadId);
  const query = experimental_useRpcQuery({ contract, method: "owner", input: { threadId }, enabled: known === undefined && /^thr_[a-z0-9]+$/i.test(threadId) });
  useVisibleInterval(query.refetch, MEMBERSHIP_REFRESH_MS, known === undefined);
  return known !== undefined ? known : query.data ? query.data.owner : query.error ? null : undefined;
}
export function useOwnershipIndex() {
  const query = experimental_useRpcQuery({ contract, method: "orchestrators", input: {} });
  const sidebar = experimental_useSidebarThreads();
  const roots = useMemo(() => query.data ? new Set(query.data.ids) : null, [query.data]);
  const parents = useMemo(() => new Map(sidebar.threads.map((thread) => [thread.id, thread.parentThreadId])), [sidebar.threads]);
  return { roots, refetch: query.refetch, owner: (id: string) => knownOwner(id, roots, parents) };
}
