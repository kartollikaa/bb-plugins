import { z } from "zod";

export const PR_SOURCES = ["review", "author", "assigned", "mentioned"] as const;
export type PrSource = (typeof PR_SOURCES)[number];

export type Attention = (typeof ATTENTIONS)[number];

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

export const ATTENTIONS = [
  "review",
  "changes_requested",
  "ci_failed",
  "conflicts",
  "ready",
  "assigned",
  "mentioned",
] as const;

export const settingsSchema = z.object({
  sources: z.object({ review: z.boolean(), author: z.boolean(), assigned: z.boolean(), mentioned: z.boolean() }),
  /** For my own PRs: only those waiting on me, or all of them. */
  myPrs: z.enum(["attention", "all"]),
  teamReviews: z.boolean(),
  drafts: z.boolean(),
  hiddenOrgs: z.array(z.string().max(100)).max(200),
  /** `snoozeKey(pr)` values; a PR comes back once it is updated. */
  snoozed: z.array(z.string().max(400)).max(500),
});
export type FolderSettings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema
  .omit({ snoozed: true })
  .extend({ sources: settingsSchema.shape.sources.partial() })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const DEFAULT_SETTINGS: FolderSettings = {
  sources: { review: true, author: true, assigned: true, mentioned: false },
  myPrs: "attention",
  teamReviews: true,
  drafts: true,
  hiddenOrgs: [],
  snoozed: [],
};

/** Stored settings with any missing or broken field back at its default. */
export function readSettings(raw: unknown): FolderSettings {
  const stored = typeof raw === "object" && raw !== null ? (raw as Partial<Record<keyof FolderSettings, unknown>>) : {};
  const field = <K extends keyof FolderSettings>(key: K): FolderSettings[K] => {
    const parsed = settingsSchema.shape[key].safeParse(stored[key]);
    return parsed.success ? (parsed.data as FolderSettings[K]) : DEFAULT_SETTINGS[key];
  };
  const sources = settingsSchema.shape.sources.partial().safeParse(stored.sources);
  return {
    sources: { ...DEFAULT_SETTINGS.sources, ...(sources.success ? sources.data : {}) },
    myPrs: field("myPrs"),
    teamReviews: field("teamReviews"),
    drafts: field("drafts"),
    hiddenOrgs: field("hiddenOrgs"),
    snoozed: field("snoozed"),
  };
}

export function applyPatch(settings: FolderSettings, patch: SettingsPatch): FolderSettings {
  return { ...settings, ...patch, sources: { ...settings.sources, ...patch.sources } };
}

export function setSnoozed(settings: FolderSettings, key: string, snoozed: boolean): FolderSettings {
  const rest = settings.snoozed.filter((existing) => existing !== key);
  return { ...settings, snoozed: snoozed ? [...rest, key].slice(-500) : rest };
}

/** Drops snoozes whose PR changed, closed or merged since. */
export function pruneSnoozed(settings: FolderSettings, prs: readonly GithubPr[]): FolderSettings {
  const live = new Set(prs.map(snoozeKey));
  const kept = settings.snoozed.filter((key) => live.has(key));
  return kept.length === settings.snoozed.length ? settings : { ...settings, snoozed: kept };
}

export function snoozeKey(pr: Pick<GithubPr, "url" | "updatedAt">): string {
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

export const folderItemSchema = z.object({
  pr: githubPrSchema,
  /** Why it is listed, most urgent first; empty for one of my PRs listed under "all". */
  attention: z.array(z.enum(ATTENTIONS)),
  snoozeKey: z.string(),
});
export type FolderItem = z.infer<typeof folderItemSchema>;

export interface Folder {
  items: FolderItem[];
  /** Snoozed items that still pass every other filter. */
  snoozed: FolderItem[];
  /** Every org the fetched PRs belong to, for the customize menu. */
  orgs: string[];
}

function rank(item: FolderItem): number {
  const first = item.attention[0];
  return first === undefined ? ATTENTIONS.length : ATTENTIONS.indexOf(first);
}

export function buildFolder(prs: readonly GithubPr[], settings: FolderSettings): Folder {
  const items: FolderItem[] = [];
  const snoozed: FolderItem[] = [];
  const hiddenOrgs = new Set(settings.hiddenOrgs);
  const snoozedKeys = new Set(settings.snoozed);
  for (const pr of prs) {
    if (hiddenOrgs.has(pr.owner)) continue;
    if (pr.isDraft && !settings.drafts) continue;
    const attention = attentionOf(pr, settings);
    const listedAsMine = settings.sources.author && settings.myPrs === "all" && pr.sources.includes("author");
    if (attention.length === 0 && !listedAsMine) continue;
    const key = snoozeKey(pr);
    (snoozedKeys.has(key) ? snoozed : items).push({ pr, attention, snoozeKey: key });
  }
  const byUrgency = (a: FolderItem, b: FolderItem) => rank(a) - rank(b) || b.pr.updatedAt.localeCompare(a.pr.updatedAt);
  return {
    items: items.sort(byUrgency),
    snoozed: snoozed.sort(byUrgency),
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
