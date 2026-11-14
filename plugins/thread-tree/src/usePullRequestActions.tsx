import { useCallback, useMemo, useState } from "react";
import { experimental_useRpcKeyedQuery, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { z } from "zod";
import type { rpcContract } from "../server";
import { Icon } from "@/components/ui/icon";
import { pullRequestActions, type PullRequestActions } from "./pullRequestActions";
import { ActionPill, runPending, usePending } from "./RetryButton";

const MERGE_CONFIRM_MS = 10_000;

const contract = {
  reviewProjects: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(z.string(), z.object({ projectId: z.string(), name: z.string() }).nullable()),
  },
};

/** The part of a PR an action needs, from a Needs you item or a GitHub Folder row. */
export interface ActionablePullRequest {
  url: string;
  number: number;
  title: string;
  repo: string;
  attention: readonly string[];
  threadId: string | null;
}

/** Resolves true only on the toast's Merge; closing or ignoring it cancels. */
function confirmMerge(pr: ActionablePullRequest): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    toast(`Merge #${pr.number}?`, {
      description: `${pr.title} · merge commit`,
      duration: MERGE_CONFIRM_MS,
      action: { label: "Merge", onClick: () => settle(true) },
      cancel: { label: "Cancel", onClick: () => settle(false) },
      onDismiss: () => settle(false),
      onAutoClose: () => settle(false),
    });
  });
}

/** Merge and Agent review for PR rows; reviews started here count as the PR's thread until a link shows up. */
export function usePullRequestActions({ repos, mergeEnvironmentOf, onMerged, onNavigate }: {
  repos: readonly string[];
  mergeEnvironmentOf: (url: string) => string | null;
  onMerged: () => void;
  onNavigate: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const repoKey = JSON.stringify([...new Set(repos.filter(Boolean).map((repo) => repo.toLowerCase()))].sort());
  const keys = useMemo<string[]>(() => JSON.parse(repoKey), [repoKey]);
  const projects = experimental_useRpcKeyedQuery({ contract, method: "reviewProjects", keys, enabled: keys.length > 0 });
  const [startedReviews, setStartedReviews] = useState<ReadonlyMap<string, string>>(new Map());

  const actionsOf = useCallback((pr: ActionablePullRequest): PullRequestActions => pullRequestActions({
    attention: pr.attention,
    threadId: pr.threadId ?? startedReviews.get(pr.url.toLowerCase()) ?? null,
    mergeEnvironmentId: mergeEnvironmentOf(pr.url),
    reviewProject: projects.data?.[pr.repo.toLowerCase()] ?? null,
  }), [mergeEnvironmentOf, projects.data, startedReviews]);

  const merge = useCallback(async (pr: ActionablePullRequest, environmentId: string) => {
    if (!(await confirmMerge(pr))) return;
    const { message } = await rpc.call("mergePullRequest", { environmentId, url: pr.url });
    toast.success(`Merged #${pr.number}`, { description: message || pr.title });
    onMerged();
  }, [rpc, onMerged]);

  const review = useCallback(async (pr: ActionablePullRequest) => {
    const { threadId } = await rpc.call("agentReview", { url: pr.url, number: pr.number, title: pr.title });
    setStartedReviews((previous) => new Map(previous).set(pr.url.toLowerCase(), threadId));
    navigate.toThread(threadId);
    onNavigate();
  }, [rpc, navigate, onNavigate]);

  return { actionsOf, merge, review, startedReviews };
}

export type PullRequestActionHandlers = ReturnType<typeof usePullRequestActions>;

interface ResolvedAction {
  key: string;
  label: string;
  ariaLabel: string;
  icon: string;
  errorTitle: string;
  run: () => Promise<unknown>;
}

function resolveAction(pr: ActionablePullRequest, handlers: PullRequestActionHandlers): ResolvedAction | null {
  const { mergeEnvironmentId, reviewProject } = handlers.actionsOf(pr);
  if (mergeEnvironmentId) {
    return { key: `merge:${pr.url}`, label: "Merge", ariaLabel: `Merge #${pr.number}`, icon: "GitMerge", errorTitle: "Merge failed", run: () => handlers.merge(pr, mergeEnvironmentId) };
  }
  if (reviewProject) {
    return { key: `review:${pr.url}`, label: "Review", ariaLabel: `Agent review of #${pr.number} in ${reviewProject.name}`, icon: "Bot", errorTitle: "Couldn't start the review", run: () => handlers.review(pr) };
  }
  return null;
}

/** Needs you's button for a PR item, beside Snooze like Retry on a failed turn. */
export function PullRequestActionPill({ pr, handlers }: { pr: ActionablePullRequest; handlers: PullRequestActionHandlers }) {
  const action = resolveAction(pr, handlers);
  return action ? <ActionPill label={action.label} pendingKey={action.key} ariaLabel={action.ariaLabel} icon={action.icon} errorTitle={action.errorTitle} tone="neutral" run={action.run} /> : null;
}

/** The PR section's hover-strip form of the same action. */
export function PullRequestActionIcon({ pr, handlers, className }: { pr: ActionablePullRequest; handlers: PullRequestActionHandlers; className: string }) {
  const action = resolveAction(pr, handlers);
  const pending = usePending(action?.key ?? "");
  if (!action) return null;
  return (
    <button
      type="button"
      aria-label={action.ariaLabel}
      title={action.ariaLabel}
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation();
        void runPending(action.key, action.errorTitle, action.run);
      }}
      className={className}
    >
      <Icon name={pending ? "Loading" : action.icon} fallback="Play" aria-hidden className="size-3.5" />
    </button>
  );
}
