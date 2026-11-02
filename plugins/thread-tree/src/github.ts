import { z } from "zod";

export const PR_SOURCES = ["review", "author", "assigned", "mentioned"] as const;
export type PrSource = (typeof PR_SOURCES)[number];

export type Attention = "review" | "changes_requested" | "ci_failed" | "conflicts" | "ready" | "assigned" | "mentioned";

export const githubPrSchema = z.object({
  url: z.string(),
  number: z.number(),
  title: z.string(),
  repo: z.string(),
  owner: z.string(),
  author: z.string(),
  isDraft: z.boolean(),
  updatedAt: z.string(),
  review: z.enum(["approved", "changes_requested", "review_required"]).nullable(),
  ci: z.enum(["failed", "pending", "passed"]).nullable(),
  conflicts: z.boolean(),
  sources: z.array(z.enum(PR_SOURCES)),
  /** Review requested only through a team, not from me by name. */
  teamReview: z.boolean(),
});
export type GithubPr = z.infer<typeof githubPrSchema>;

const SEARCH_LIMIT = 50;
const OPEN_PR = "is:pr is:open archived:false";

/** Aliases of the one GraphQL call; `userReview` tells a personal review request from a team one. */
const SEARCHES = {
  review: `${OPEN_PR} review-requested:@me`,
  userReview: `${OPEN_PR} user-review-requested:@me`,
  author: `${OPEN_PR} author:@me`,
  assigned: `${OPEN_PR} assignee:@me`,
  mentioned: `${OPEN_PR} mentions:@me`,
} as const;

export const GITHUB_QUERY = `query {
  viewer { login }
${Object.entries(SEARCHES)
  .map(([alias, query]) => `  ${alias}: search(type: ISSUE, first: ${SEARCH_LIMIT}, query: ${JSON.stringify(query)}) { ...prs }`)
  .join("\n")}
}
fragment prs on SearchResultItemConnection {
  nodes {
    ... on PullRequest {
      url number title isDraft updatedAt reviewDecision mergeable
      author { login }
      repository { nameWithOwner owner { login } }
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }
}`;

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return typeof value === "object" && value !== null ? (value as Json) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nodes(value: unknown): Json[] {
  const list = obj(value).nodes;
  return Array.isArray(list) ? list.map(obj).filter((node) => typeof node.url === "string") : [];
}

function ciOf(node: Json): GithubPr["ci"] {
  const commits = obj(node.commits).nodes;
  const last = Array.isArray(commits) ? obj(commits[commits.length - 1]) : {};
  const state = str(obj(obj(last.commit).statusCheckRollup).state);
  if (state === "FAILURE" || state === "ERROR") return "failed";
  if (state === "PENDING" || state === "EXPECTED") return "pending";
  if (state === "SUCCESS") return "passed";
  return null;
}

function reviewOf(node: Json): GithubPr["review"] {
  const decision = str(node.reviewDecision);
  if (decision === "APPROVED") return "approved";
  if (decision === "CHANGES_REQUESTED") return "changes_requested";
  if (decision === "REVIEW_REQUIRED") return "review_required";
  return null;
}

/** One account's search response, every PR once with the searches it came from. */
export function parseSearch(data: unknown): { login: string; prs: GithubPr[] } {
  const root = obj(data);
  const byUrl = new Map<string, GithubPr>();
  const personal = new Set(nodes(root.userReview).map((node) => str(node.url)));
  for (const source of PR_SOURCES) {
    for (const node of nodes(root[source])) {
      const url = str(node.url);
      const existing = byUrl.get(url);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
        continue;
      }
      const repository = obj(node.repository);
      byUrl.set(url, {
        url,
        number: typeof node.number === "number" ? node.number : 0,
        title: str(node.title),
        repo: str(repository.nameWithOwner),
        owner: str(obj(repository.owner).login),
        author: str(obj(node.author).login),
        isDraft: node.isDraft === true,
        updatedAt: str(node.updatedAt),
        review: reviewOf(node),
        ci: ciOf(node),
        conflicts: str(node.mergeable) === "CONFLICTING",
        sources: [source],
        teamReview: false,
      });
    }
  }
  for (const pr of byUrl.values()) pr.teamReview = pr.sources.includes("review") && !personal.has(pr.url);
  return { login: str(obj(root.viewer).login), prs: [...byUrl.values()] };
}

/** PRs seen by several gh accounts merge into one row; a personal review request beats a team one. */
export function mergeAccounts(lists: readonly (readonly GithubPr[])[]): GithubPr[] {
  const byUrl = new Map<string, GithubPr>();
  for (const pr of lists.flat()) {
    const existing = byUrl.get(pr.url);
    if (!existing) {
      byUrl.set(pr.url, { ...pr, sources: [...pr.sources] });
      continue;
    }
    for (const source of pr.sources) if (!existing.sources.includes(source)) existing.sources.push(source);
    existing.teamReview = existing.teamReview && pr.teamReview;
  }
  return [...byUrl.values()];
}

export interface FolderSettings {
  sources: Readonly<Record<PrSource, boolean>>;
  /** For my own PRs: only those waiting on me, or all of them. */
  myPrs: "attention" | "all";
  teamReviews: boolean;
  drafts: boolean;
  hiddenOrgs: ReadonlySet<string>;
  /** `hideKey(pr)` values; a PR comes back once it is updated. */
  hiddenPrs: ReadonlySet<string>;
}

export const DEFAULT_SOURCES: Readonly<Record<PrSource, boolean>> = {
  review: true,
  author: true,
  assigned: true,
  mentioned: false,
};

export function hideKey(pr: Pick<GithubPr, "url" | "updatedAt">): string {
  return `${pr.url}@${pr.updatedAt}`;
}

/** Why a PR is in the folder, most urgent first; empty when it is only listed as one of my PRs. */
export function attentionOf(pr: GithubPr, settings: FolderSettings): Attention[] {
  const reasons: Attention[] = [];
  const has = (source: PrSource) => settings.sources[source] && pr.sources.includes(source);
  if (has("review") && (settings.teamReviews || !pr.teamReview)) reasons.push("review");
  if (has("author")) {
    if (pr.review === "changes_requested") reasons.push("changes_requested");
    if (pr.ci === "failed") reasons.push("ci_failed");
    if (pr.conflicts) reasons.push("conflicts");
    if (pr.review === "approved" && !pr.isDraft && !pr.conflicts && pr.ci !== "failed" && pr.ci !== "pending") {
      reasons.push("ready");
    }
  }
  if (has("assigned") && !pr.sources.includes("author")) reasons.push("assigned");
  if (has("mentioned")) reasons.push("mentioned");
  return reasons;
}

const ATTENTION_ORDER: readonly Attention[] = [
  "review",
  "changes_requested",
  "ci_failed",
  "conflicts",
  "ready",
  "assigned",
  "mentioned",
];

export interface FolderItem {
  pr: GithubPr;
  attention: Attention[];
}

export interface Folder {
  items: FolderItem[];
  /** Items the user hid with "Hide until updated"; they still pass every other filter. */
  hidden: FolderItem[];
  /** Every org the fetched PRs belong to, for the customize menu. */
  orgs: string[];
}

function rank(item: FolderItem): number {
  const first = item.attention[0];
  return first === undefined ? ATTENTION_ORDER.length : ATTENTION_ORDER.indexOf(first);
}

export function buildFolder(prs: readonly GithubPr[], settings: FolderSettings): Folder {
  const items: FolderItem[] = [];
  const hidden: FolderItem[] = [];
  for (const pr of prs) {
    if (settings.hiddenOrgs.has(pr.owner)) continue;
    if (pr.isDraft && !settings.drafts) continue;
    const attention = attentionOf(pr, settings);
    const listedAsMine = settings.sources.author && settings.myPrs === "all" && pr.sources.includes("author");
    if (attention.length === 0 && !listedAsMine) continue;
    (settings.hiddenPrs.has(hideKey(pr)) ? hidden : items).push({ pr, attention });
  }
  const byUrgency = (a: FolderItem, b: FolderItem) => rank(a) - rank(b) || b.pr.updatedAt.localeCompare(a.pr.updatedAt);
  return {
    items: items.sort(byUrgency),
    hidden: hidden.sort(byUrgency),
    orgs: [...new Set(prs.map((pr) => pr.owner))].filter(Boolean).sort((a, b) => a.localeCompare(b)),
  };
}

export const ATTENTION_LABEL: Record<Attention, string> = {
  review: "Review requested",
  changes_requested: "Changes requested",
  ci_failed: "Checks failing",
  conflicts: "Has conflicts",
  ready: "Approved, ready to merge",
  assigned: "Assigned to you",
  mentioned: "Mentions you",
};
