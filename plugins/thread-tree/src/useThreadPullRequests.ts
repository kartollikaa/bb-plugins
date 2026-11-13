import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { experimental_useRpcKeyedQuery, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import { createRefreshScheduler } from "./refreshScheduler";
import { activitySignatures, changedKeys } from "./pullRequestKeys";
import { mergePullRequests, threadPullRequestSchema, type ThreadPullRequest } from "./threadPullRequests";

const REFRESH_MS = 60_000;
const ACTIVITY_DEBOUNCE_MS = 500;

const contract = {
  threadPullRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(z.string(), z.array(threadPullRequestSchema)),
  },
  pullRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(z.string(), z.discriminatedUnion("outcome", [
      z.object({
        outcome: z.literal("available"),
        pullRequest: z.object({
          number: z.number(),
          title: z.string(),
          url: z.string(),
          state: z.enum(["draft", "open", "merged", "closed"]),
          attention: z.string(),
          checks: z.object({ state: z.string() }),
        }),
      }),
      z.object({ outcome: z.literal("absent") }),
      z.object({ outcome: z.literal("unavailable"), message: z.string() }),
    ])),
  },
};

/** A hidden sidebar is neither on screen nor on a visible page. */
function useShown(element: HTMLElement | null, onChange: (shown: boolean) => void) {
  useEffect(() => {
    let onScreen = true;
    const report = () => onChange(onScreen && document.visibilityState === "visible");
    const observer = element && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        report();
      })
      : null;
    if (element) observer?.observe(element);
    document.addEventListener("visibilitychange", report);
    report();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", report);
    };
  }, [element, onChange]);
}

/** Every listed thread's PRs in one list-level query, refreshed by one scheduler that pauses while hidden. */
export function useThreadPullRequests(threads: readonly PluginSidebarThread[], containerRef: RefObject<HTMLElement | null>) {
  const threadKey = JSON.stringify(threads.map((thread) => thread.id).sort());
  const environmentKey = JSON.stringify([...new Set(threads.flatMap((thread) => thread.environment?.id ? [thread.environment.id] : []))].sort());
  const threadIds = useMemo<string[]>(() => JSON.parse(threadKey), [threadKey]);
  const environmentIds = useMemo<string[]>(() => JSON.parse(environmentKey), [environmentKey]);
  const status = experimental_useRpcKeyedQuery({
    pluginId: "bb--github-pr-status",
    contract,
    method: "pullRequests",
    keys: environmentIds,
    enabled: environmentIds.length > 0,
  });
  const session = experimental_useRpcKeyedQuery({ contract, method: "threadPullRequests", keys: threadIds, enabled: threadIds.length > 0 });

  const latest = useRef({ session, threadIds });
  latest.current = { session, threadIds };
  const scheduler = useMemo(() => createRefreshScheduler({
    refreshAll: () => void latest.current.session.refetchKeys(latest.current.threadIds),
    refreshKeys: (keys) => void latest.current.session.refetchKeys(keys),
    intervalMs: REFRESH_MS,
    debounceMs: ACTIVITY_DEBOUNCE_MS,
    timers: {
      setInterval: (run, ms) => window.setInterval(run, ms),
      clearInterval: (id) => window.clearInterval(id),
      setTimeout: (run, ms) => window.setTimeout(run, ms),
      clearTimeout: (id) => window.clearTimeout(id),
      now: () => Date.now(),
    },
  }), []);
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  // The container mounts after the loading placeholder, so the next render picks it up.
  useShown(containerRef.current, useCallback((shown: boolean) => scheduler.setShown(shown), [scheduler]));
  const signatures = useRef(new Map<string, string>());
  useEffect(() => {
    const next = activitySignatures(threads);
    scheduler.requestKeys(changedKeys(signatures.current, next));
    signatures.current = next;
  }, [threads, scheduler]);

  const statusData = status.error ? undefined : status.data;
  const sessionData = session.data;
  return useCallback((thread: PluginSidebarThread): ThreadPullRequest[] => {
    const row = thread.environment?.id ? statusData?.[thread.environment.id] : undefined;
    return mergePullRequests(row?.outcome === "available" ? row.pullRequest : undefined, sessionData?.[thread.id] ?? []);
  }, [statusData, sessionData]);
}
