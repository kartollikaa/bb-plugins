import { useEffect, useMemo } from "react";
import { experimental_useRpcKeyedQuery, useBbNavigate, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { excludeDescendantPullRequests, mergePullRequests, threadPullRequestSchema, type ThreadPullRequest } from "./threadPullRequests";

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

export function ThreadPullRequestBadge({ thread, descendants }: { thread: PluginSidebarThread; descendants: readonly PluginSidebarThread[] }) {
  const threads = useMemo(() => [thread, ...descendants], [thread, descendants]);
  const threadKey = JSON.stringify(threads.map((entry) => entry.id).sort());
  const activityKey = JSON.stringify(threads.map((entry) => [entry.id, entry.updatedAt]).sort());
  const environmentKey = JSON.stringify([...new Set(threads.flatMap((entry) => entry.environment?.id ? [entry.environment.id] : []))].sort());
  const threadIds = useMemo<string[]>(() => JSON.parse(threadKey), [threadKey]);
  const environmentIds = useMemo<string[]>(() => JSON.parse(environmentKey), [environmentKey]);
  const { data, error } = experimental_useRpcKeyedQuery({
    pluginId: "bb--github-pr-status",
    contract,
    method: "pullRequests",
    keys: environmentIds,
    enabled: environmentIds.length > 0,
  });
  const session = experimental_useRpcKeyedQuery({
    contract, method: "threadPullRequests", keys: threadIds,
  });
  useEffect(() => {
    const timer = window.setTimeout(() => void session.refetchKeys(threadIds), 500);
    return () => window.clearTimeout(timer);
  }, [threadIds, activityKey]);
  useEffect(() => {
    const timer = window.setInterval(() => void session.refetchKeys(threadIds), 60_000);
    return () => window.clearInterval(timer);
  }, [threadIds, session.refetchKeys]);
  const prsFor = (entry: PluginSidebarThread) => {
    const row = entry.environment?.id ? data?.[entry.environment.id] : undefined;
    return mergePullRequests(!error && row?.outcome === "available" ? row.pullRequest : undefined, session.data?.[entry.id] ?? []);
  };
  const prs = excludeDescendantPullRequests(prsFor(thread), descendants.flatMap(prsFor));
  return prs.length > 0 ? (
    <div className="-mt-1 mb-0.5 ml-6 flex gap-1 overflow-x-auto">
      {prs.map((pr) => <PullRequestBadge key={pr.url} pr={pr} />)}
    </div>
  ) : null;
}

function PullRequestBadge({ pr }: { pr: ThreadPullRequest }) {
  const navigate = useBbNavigate();
  const active = pr.state === "open" || pr.state === "draft";
  const failed = active && (pr.checks.state === "failing" || pr.attention === "conflicts");
  const pending = active && !failed && pr.checks.state === "pending";
  const details: string[] = [pr.state];
  if (active && pr.attention !== "none" && pr.attention !== pr.state) details.push(pr.attention.replaceAll("_", " "));
  if (active && !pr.attention.startsWith("checks_")) details.push(`checks ${pr.checks.state}`);
  const label = `PR #${pr.number}: ${pr.title} · ${details.join(" · ")}`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        navigate.openUrl(pr.url);
      }}
      className={cn(
        "relative flex h-4 shrink-0 items-center gap-0.5 rounded px-0.5 text-2xs tabular-nums outline-none hover:bg-sidebar-foreground/10 focus-visible:ring-1 focus-visible:ring-sidebar-ring",
        pr.state === "merged" ? "text-purple-400" : pr.state === "closed" ? "text-red-400" : (pr.state === "draft" || pr.state === "unknown") ? "text-muted-foreground" : "text-green-400",
      )}
    >
      <span className="relative flex size-4 items-center justify-center">
        <Icon name={pr.state === "merged" ? "GitMerge" : pr.state === "closed" ? "GitPullRequestClosed" : pr.state === "draft" ? "GitPullRequestDraft" : "GitPullRequest"} aria-hidden className="size-3.5" />
        {failed ? <Icon name="X" aria-hidden className="absolute bottom-0 right-0 size-2.5 rounded-full bg-sidebar text-red-400" /> : null}
        {pending ? <span aria-hidden className="absolute bottom-0 right-0 size-1.5 rounded-full bg-amber-400" /> : null}
      </span>
      <span>#{pr.number}</span>
    </button>
  );
}
