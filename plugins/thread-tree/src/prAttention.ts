// Which of a thread's PRs earns the row's PR icon, and why.
import type { Attention, GithubFolderItem } from "./githubFolder.ts";
import type { ThreadPullRequest } from "./threadPullRequests.ts";

export type PrReason = "failing" | "conflicts" | "changes" | "ready";

/** Most urgent first; it also picks the one PR a row shows. */
export const PR_REASONS: readonly PrReason[] = ["failing", "conflicts", "changes", "ready"];

export const PR_REASON_LOOK: Record<PrReason, { label: string; icon: string; className: string }> = {
  failing: { label: "Checks failing", icon: "GitPullRequest", className: "text-red-600 dark:text-red-400" },
  conflicts: { label: "Has conflicts", icon: "GitPullRequest", className: "text-orange-600 dark:text-orange-400" },
  changes: { label: "Changes requested", icon: "GitPullRequest", className: "text-amber-600 dark:text-amber-400" },
  ready: { label: "Ready to merge", icon: "GitMerge", className: "text-green-600 dark:text-green-400" },
};

export type FolderAttention = ReadonlyMap<string, readonly Attention[]>;

/** GitHub Folder's attention per PR URL; empty when that plugin is absent. */
export function folderAttentionByUrl(items: readonly GithubFolderItem[]): FolderAttention {
  return new Map(items.map((item) => [item.pr.url.toLowerCase(), item.attention]));
}

/** Failing and Conflicts come from bb's PR status; Changes and Ready only from GitHub Folder. */
export function prActionReason(pr: ThreadPullRequest, folder: FolderAttention): PrReason | null {
  if (pr.state !== "open" && pr.state !== "draft" && pr.state !== "unknown") return null;
  const attention = folder.get(pr.url.toLowerCase()) ?? [];
  if (pr.state !== "unknown" && pr.checks.state === "failing") return "failing";
  if (attention.includes("ci_failed")) return "failing";
  if (pr.attention === "conflicts" || attention.includes("conflicts")) return "conflicts";
  if (attention.includes("changes_requested")) return "changes";
  if (attention.includes("ready")) return "ready";
  return null;
}

export interface RowPullRequest {
  pr: ThreadPullRequest;
  reason: PrReason;
}

/** The most urgent actionable PR; null for a failed thread, which shows Retry instead. */
export function rowPullRequest(prs: readonly ThreadPullRequest[], folder: FolderAttention, threadFailed: boolean): RowPullRequest | null {
  if (threadFailed) return null;
  let best: RowPullRequest | null = null;
  for (const pr of prs) {
    const reason = prActionReason(pr, folder);
    if (reason && (!best || PR_REASONS.indexOf(reason) < PR_REASONS.indexOf(best.reason))) best = { pr, reason };
  }
  return best;
}

export function prTooltip({ pr, reason }: RowPullRequest): string {
  return `PR #${pr.number}: ${pr.title} · ${PR_REASON_LOOK[reason].label}`;
}
