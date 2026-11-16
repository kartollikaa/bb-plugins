import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { experimental_useRpcKeyedQuery, experimental_useRpcQuery, experimental_useSidebarThreads } from "@get-bb/plugin-sdk/app";
import { combineAnswers } from "./answered.ts";
import { contract } from "./contract.ts";
import type { LedgerSummary } from "./contract.ts";
import { changeWatcher, turnSignal } from "./refresh.ts";
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

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** The SDK's `refetch` is a new function on every render, so the timer reads the latest tick instead of restarting. */
export function useVisibleInterval(tick: () => void, ms: number, enabled = true) {
  const latest = useLatest(tick);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") latest.current();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") latest.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [latest, ms, enabled]);
}

function useRefetchOnChange(signal: string | null, refetch: () => void, enabled: boolean) {
  const latest = useLatest(refetch);
  const [watch] = useState(() => changeWatcher(() => latest.current()));
  useEffect(() => {
    if (enabled) watch(signal);
  }, [watch, signal, enabled]);
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
  | { kind: "ready"; view: View; ledger: LedgerSummary; report: { text: string; truncated: boolean } | null; workspace: { environmentId: string; rootPath: string; hostId: string; ledgerHostId: string | null; storageRootPath: string | null } | null; threadIds: Record<string, string> };

export function useOrchestration(threadId: string, enabled: boolean): OrchestrationState {
  const query = experimental_useRpcQuery({ contract, method: "snapshot", input: { threadId }, enabled });
  useVisibleInterval(query.refetch, SNAPSHOT_REFRESH_MS, enabled);
  const sidebar = experimental_useSidebarThreads();
  const orchestratorSignal = turnSignal(sidebar.threads.find((t) => t.id === threadId));
  useRefetchOnChange(orchestratorSignal, query.refetch, enabled);
  const now = useNow();
  const repliesVersion = useSyncExternalStore(replies.subscribe, replies.version);
  const ledgerThreads = query.data?.state === "ledger" ? query.data.ledger.subtasks : null;
  const waiting = useMemo(() => {
    const ours = new Set([threadId, ...(ledgerThreads ?? []).flatMap((s) => (s.threadId ? [s.threadId] : []))]);
    return sidebar.threads.filter((t) => t.hasPendingInteraction && (ours.has(t.id) || t.parentThreadId === threadId)).map((t) => t.id).sort().slice(0, 50);
  }, [sidebar.threads, ledgerThreads, threadId]);
  const pendingQuery = experimental_useRpcQuery({ contract, method: "pending", input: { threadId, threadIds: waiting }, enabled: enabled && waiting.length > 0 });
  useVisibleInterval(pendingQuery.refetch, SNAPSHOT_REFRESH_MS, enabled && waiting.length > 0);

  const activityKeys = useMemo(() => {
    const keys = new Set<string>([threadId]);
    for (const subtask of ledgerThreads ?? []) {
      const thread = subtask.threadId ? sidebar.threads.find((t) => t.id === subtask.threadId) : undefined;
      if (thread && (["starting", "active", "stopping"].includes(thread.status) || (thread.activity?.backgroundCommands ?? 0) + (thread.activity?.backgroundAgents ?? 0) > 0)) keys.add(thread.id);
    }
    return [...keys].sort().slice(0, 50);
  }, [sidebar.threads, ledgerThreads, threadId]);
  const activityQuery = experimental_useRpcKeyedQuery({ contract, method: "activity", keys: activityKeys, enabled });

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
        pending: thread.hasPendingInteraction ? pendingQuery.data?.[thread.id] ?? null : null,
        backgroundCommands: thread.activity?.backgroundCommands ?? 0,
        backgroundAgents: thread.activity?.backgroundAgents ?? 0,
      };
    }
    return map;
  }, [sidebar.threads, pendingQuery.data]);

  return useMemo<OrchestrationState>(() => {
    const data = query.data;
    if (!data) {
      if (query.error) return { kind: "error", message: query.error.message, retry: () => void query.refetch() };
      return { kind: "loading" };
    }
    if (data.state === "none") return { kind: "none" };
    if (data.state === "error") return { kind: "error", message: data.message, retry: () => void query.refetch() };
    const answered = combineAnswers(data.answered, replies.answers(threadId), data.askFirstSeen);
    const view = buildView({ ledger: data.ledger, agents: data.agents, live, orchestratorThreadId: threadId, now: Math.max(now, data.readAt), answered, activity: activityQuery.data, report: data.report ?? null, ledgerModifiedAt: data.ledgerModifiedAt ?? null });
    return { kind: "ready", view, ledger: data.ledger, report: data.report ?? null, workspace: data.workspace ?? null, threadIds: view.threadIds };
  }, [query.data, query.error, query.refetch, live, threadId, now, repliesVersion, activityQuery.data]);
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
