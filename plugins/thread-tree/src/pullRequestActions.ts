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

/** The reasoning setting value that keeps the review model's own default. */
export const REVIEW_REASONING_DEFAULT = "default";

export interface ReviewModelChoice {
  model: string;
  reasoningLevel: string;
}

export interface ProviderModelCatalog {
  providerId: string;
  models: readonly {
    model: string;
    defaultReasoningEffort: string;
    reasoningDiscovery?: "known" | "unknown";
    supportedReasoningEfforts: readonly { reasoningEffort: string }[];
  }[];
}

type ExecutionSource = "explicit";

export interface ReviewExecution {
  providerId?: string;
  model?: string;
  reasoningLevel?: string;
  executionInputSources?: { providerId: ExecutionSource; model: ExecutionSource; reasoningLevel?: ExecutionSource };
}

/** The project's provider first, so a model several providers offer runs where the project's threads do. */
export function reviewProviderOrder(providerIds: readonly string[], projectProviderId: string | null): string[] {
  return projectProviderId && providerIds.includes(projectProviderId)
    ? [projectProviderId, ...providerIds.filter((id) => id !== projectProviderId)]
    : [...providerIds];
}

export function catalogOffers(catalog: ProviderModelCatalog, model: string): boolean {
  return catalog.models.some((candidate) => candidate.model === model.trim());
}

/**
 * The provider is the first catalog offering the model, since a model id only runs on its own provider.
 * A blank model, or one no catalog offers, leaves the project's defaults. The level sent is the chosen one,
 * else the model's default; a model without a default sends none, and bb fills in the project's level.
 */
export function reviewExecution(choice: ReviewModelChoice, catalogs: readonly ProviderModelCatalog[]): { execution: ReviewExecution; warning: string | null } {
  const model = choice.model.trim();
  if (!model) return { execution: {}, warning: null };
  for (const catalog of catalogs) {
    const entry = catalog.models.find((candidate) => candidate.model === model);
    if (!entry) continue;
    const chosen = choice.reasoningLevel === REVIEW_REASONING_DEFAULT ? null : choice.reasoningLevel;
    const supported = chosen !== null && (entry.reasoningDiscovery === "unknown" || entry.supportedReasoningEfforts.some((effort) => effort.reasoningEffort === chosen));
    const level = supported ? chosen : entry.defaultReasoningEffort || null;
    return {
      execution: {
        providerId: catalog.providerId,
        model,
        ...(level ? { reasoningLevel: level } : {}),
        executionInputSources: { providerId: "explicit", model: "explicit", ...(level ? { reasoningLevel: "explicit" as const } : {}) },
      },
      warning: chosen !== null && !supported ? `${model} doesn't support reasoning level ${chosen}; the review uses ${level ? "the model's default" : "the project's level"}` : null,
    };
  }
  return { execution: {}, warning: `No available provider offers ${model}; the review uses the project's default model` };
}

export function agentReviewSpawnArgs({ projectId, url, number, title, execution }: {
  projectId: string;
  url: string;
  number: number;
  title: string;
  execution: ReviewExecution;
}) {
  return {
    projectId,
    environment: { type: "project-default" as const },
    title: `Review #${number} ${title}`.slice(0, 200),
    prompt: agentReviewPrompt({ url, number }),
    ...execution,
  };
}
