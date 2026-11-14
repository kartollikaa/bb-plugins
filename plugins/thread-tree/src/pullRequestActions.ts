// What a PR row can do besides open: Merge through the environment holding its branch, or start an agent review.
import type { PullRequestStatusRow } from "./threadPullRequests.ts";

export const PR_STATUS_PLUGIN_ID = "bb--github-pr-status";

/** `owner/repo`, lowercased, from any GitHub remote form; null for another host. */
export function repoSlugFromRemote(remote: string | null): string | null {
  const match = remote ? /^(?:git@github\.com:|(?:https|ssh|git):\/\/(?:[^@/]+@)?github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(remote.trim()) : null;
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

export function repoSlugFromPrUrl(url: string): string | null {
  const match = /^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/\d+/i.exec(url);
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}

export interface ProjectRemote {
  id: string;
  name: string;
  gitRemoteUrl: string | null;
  updatedAt: number;
}

export interface ReviewProject {
  projectId: string;
  name: string;
}

/** Two projects on one repo: the one used last wins. */
export function projectForRepo(repo: string, projects: readonly ProjectRemote[]): ReviewProject | null {
  const slug = repo.toLowerCase();
  const match = projects
    .filter((project) => repoSlugFromRemote(project.gitRemoteUrl) === slug)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return match ? { projectId: match.id, name: match.name } : null;
}

/** bb merges an environment's current-branch PR, so the PR must be that branch's and open. */
export function mergeEnvironmentOf(url: string, rows: Readonly<Record<string, PullRequestStatusRow | undefined>> | undefined): string | null {
  const wanted = url.toLowerCase();
  for (const [environmentId, row] of Object.entries(rows ?? {})) {
    if (row?.outcome === "available" && row.pullRequest.state === "open" && row.pullRequest.url.toLowerCase() === wanted) return environmentId;
  }
  return null;
}

export interface PullRequestActions {
  mergeEnvironmentId: string | null;
  reviewProject: ReviewProject | null;
}

/** Merge only on GitHub's own ready signal (approved, checks green, no conflicts); Agent review only for a PR no thread has claimed. */
export function pullRequestActions({ attention, threadId, mergeEnvironmentId, reviewProject }: {
  attention: readonly string[];
  threadId: string | null;
  mergeEnvironmentId: string | null;
  reviewProject: ReviewProject | null;
}): PullRequestActions {
  return {
    mergeEnvironmentId: attention.includes("ready") ? mergeEnvironmentId : null,
    reviewProject: threadId === null ? reviewProject : null,
  };
}

/** The PR's title stays out: it is the author's text, and the agent reads the PR itself. */
export function agentReviewPrompt({ url, number }: { url: string; number: number }): string {
  return [
    `Review pull request #${number}: ${url}`,
    "",
    "Read it with `gh pr view` and `gh pr diff`, and read the repository's own review guidance (CLAUDE.md, AGENTS.md, docs) first.",
    "Don't check out its branch in this checkout, and don't post anything to GitHub.",
    "Report findings most severe first, each with file and line, and end with a verdict: approve or request changes.",
  ].join("\n");
}
