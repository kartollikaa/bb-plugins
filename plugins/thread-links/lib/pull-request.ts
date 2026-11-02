export type JobState = "passed" | "failed" | "pending" | "skipped";

export interface CheckJob {
  name: string;
  workflow: string;
  state: JobState;
  url: string;
}

export interface PullRequestStatus {
  number: number;
  title: string;
  url: string;
  state: "draft" | "open" | "merged" | "closed";
  review: "approved" | "changes_requested" | "review_required" | "none";
  approvedBy: string[];
  changesRequestedBy: string[];
  conflicts: boolean;
  jobs: CheckJob[];
  additions: number;
  deletions: number;
  changedFiles: number;
  base: string;
  head: string;
}

export type PullRequestBadge = "draft" | "open" | "conflicts" | "merged" | "closed";
export type CiState = "failed" | "pending" | "passed";

export const GH_PR_FIELDS = [
  "number",
  "title",
  "url",
  "state",
  "isDraft",
  "reviewDecision",
  "latestReviews",
  "mergeable",
  "mergeStateStatus",
  "statusCheckRollup",
  "additions",
  "deletions",
  "changedFiles",
  "baseRefName",
  "headRefName",
].join(",");

type Json = Record<string, unknown>;

const FAILED_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);
const SKIPPED_CONCLUSIONS = new Set(["SKIPPED", "NEUTRAL", "STALE"]);
const JOB_ORDER: JobState[] = ["failed", "pending", "passed", "skipped"];

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => typeof item === "object" && item !== null) : [];
}

function jobState(check: Json): JobState {
  const outcome =
    check.__typename === "StatusContext"
      ? str(check.state)
      : str(check.status) === "COMPLETED"
        ? str(check.conclusion)
        : "PENDING";
  if (outcome === "SUCCESS") return "passed";
  if (FAILED_CONCLUSIONS.has(outcome)) return "failed";
  if (SKIPPED_CONCLUSIONS.has(outcome)) return "skipped";
  return "pending";
}

/** One job per check, failed first; a rerun replaces the older attempt left in the rollup. */
export function checkJobs(rollup: unknown): CheckJob[] {
  const latest = new Map<string, Json>();
  for (const check of list(rollup)) {
    const status = check.__typename === "StatusContext";
    const key = status ? str(check.context) : `${str(check.workflowName)}/${str(check.name)}`;
    const previous = latest.get(key);
    if (previous === undefined || str(previous.startedAt) <= str(check.startedAt)) latest.set(key, check);
  }
  return [...latest.values()]
    .map((check) => {
      const status = check.__typename === "StatusContext";
      return {
        name: status ? str(check.context) : str(check.name),
        workflow: status ? "" : str(check.workflowName),
        state: jobState(check),
        url: status ? str(check.targetUrl) : str(check.detailsUrl),
      };
    })
    .sort((a, b) => JOB_ORDER.indexOf(a.state) - JOB_ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
}

export function parsePullRequest(raw: Json): PullRequestStatus {
  const ghState = str(raw.state);
  const state = ghState === "MERGED" ? "merged" : ghState === "CLOSED" ? "closed" : raw.isDraft === true ? "draft" : "open";
  const reviews = list(raw.latestReviews);
  const authors = (wanted: string) =>
    reviews.filter((review) => str(review.state) === wanted).map((review) => str((review.author as Json | undefined)?.login));
  const decision = str(raw.reviewDecision);
  return {
    number: num(raw.number),
    title: str(raw.title),
    url: str(raw.url),
    state,
    review:
      decision === "APPROVED"
        ? "approved"
        : decision === "CHANGES_REQUESTED"
          ? "changes_requested"
          : decision === "REVIEW_REQUIRED"
            ? "review_required"
            : "none",
    approvedBy: authors("APPROVED"),
    changesRequestedBy: authors("CHANGES_REQUESTED"),
    conflicts:
      (state === "open" || state === "draft") &&
      (str(raw.mergeable) === "CONFLICTING" || str(raw.mergeStateStatus) === "DIRTY"),
    jobs: checkJobs(raw.statusCheckRollup),
    additions: num(raw.additions),
    deletions: num(raw.deletions),
    changedFiles: num(raw.changedFiles),
    base: str(raw.baseRefName),
    head: str(raw.headRefName),
  };
}

export function badge(pr: PullRequestStatus): PullRequestBadge {
  if (pr.state === "merged" || pr.state === "closed") return pr.state;
  return pr.conflicts ? "conflicts" : pr.state;
}

/** Null while no job has run yet, or every job was skipped. */
export function ciState(jobs: CheckJob[]): CiState | null {
  if (jobs.some((job) => job.state === "failed")) return "failed";
  if (jobs.some((job) => job.state === "pending")) return "pending";
  return jobs.some((job) => job.state === "passed") ? "passed" : null;
}

/** A change request outweighs approvals; a PR nobody reviewed yet shows nothing. */
export function reviewVerdict(pr: PullRequestStatus): "approved" | "changes_requested" | null {
  if (pr.state === "merged" || pr.state === "closed") return null;
  if (pr.review === "changes_requested" || pr.changesRequestedBy.length > 0) return "changes_requested";
  if (pr.review === "approved" || pr.approvedBy.length > 0) return "approved";
  return null;
}
