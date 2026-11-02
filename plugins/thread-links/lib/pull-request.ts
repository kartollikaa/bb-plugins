export type Tone = "success" | "danger" | "warning" | "info" | "neutral" | "merged";

export interface PullRequestStatus {
  number: number;
  title: string;
  url: string;
  state: "draft" | "open" | "merged" | "closed";
  review: "approved" | "changes_requested" | "review_required" | "none";
  approvedBy: string[];
  changesRequestedBy: string[];
  awaitingReviewers: string[];
  checks: { passed: number; failed: number; pending: number; skipped: number; failedNames: string[] };
  merge: "clean" | "conflicts" | "behind" | "blocked" | "unstable" | "unknown" | null;
  autoMerge: boolean;
  additions: number;
  deletions: number;
  base: string;
  head: string;
}

export interface StatusChip {
  text: string;
  tone: Tone;
  detail?: string;
}

export const GH_PR_FIELDS = [
  "number",
  "title",
  "url",
  "state",
  "isDraft",
  "reviewDecision",
  "latestReviews",
  "reviewRequests",
  "mergeable",
  "mergeStateStatus",
  "autoMergeRequest",
  "statusCheckRollup",
  "additions",
  "deletions",
  "baseRefName",
  "headRefName",
].join(",");

type Json = Record<string, unknown>;

const FAILED_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"]);
const SKIPPED_CONCLUSIONS = new Set(["SKIPPED", "NEUTRAL", "STALE"]);

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => typeof item === "object" && item !== null) : [];
}

/** Keeps the latest run of every check, since a rerun leaves the older attempts in the rollup. */
export function summarizeChecks(rollup: unknown): PullRequestStatus["checks"] {
  const latest = new Map<string, Json>();
  for (const check of list(rollup)) {
    const name = check.__typename === "StatusContext" ? str(check.context) : `${str(check.workflowName)}/${str(check.name)}`;
    const startedAt = str(check.startedAt);
    const previous = latest.get(name);
    if (previous === undefined || str(previous.startedAt) <= startedAt) latest.set(name, check);
  }
  const checks = { passed: 0, failed: 0, pending: 0, skipped: 0, failedNames: [] as string[] };
  for (const check of latest.values()) {
    const outcome =
      check.__typename === "StatusContext"
        ? str(check.state)
        : str(check.status) === "COMPLETED"
          ? str(check.conclusion)
          : "PENDING";
    if (outcome === "SUCCESS") checks.passed += 1;
    else if (FAILED_CONCLUSIONS.has(outcome)) {
      checks.failed += 1;
      checks.failedNames.push(str(check.name) || str(check.context));
    } else if (SKIPPED_CONCLUSIONS.has(outcome)) checks.skipped += 1;
    else checks.pending += 1;
  }
  return checks;
}

function reviewerName(request: Json): string {
  return str(request.login) || str(request.slug) || str(request.name);
}

export function parsePullRequest(raw: Json): PullRequestStatus {
  const ghState = str(raw.state);
  const state = ghState === "MERGED" ? "merged" : ghState === "CLOSED" ? "closed" : raw.isDraft === true ? "draft" : "open";
  const reviews = list(raw.latestReviews);
  const authors = (wanted: string) =>
    reviews.filter((review) => str(review.state) === wanted).map((review) => str((review.author as Json | undefined)?.login));
  const decision = str(raw.reviewDecision);
  const mergeState = str(raw.mergeStateStatus);
  const merge =
    state === "merged" || state === "closed"
      ? null
      : str(raw.mergeable) === "CONFLICTING" || mergeState === "DIRTY"
        ? "conflicts"
        : mergeState === "BEHIND"
          ? "behind"
          : mergeState === "BLOCKED"
            ? "blocked"
            : mergeState === "UNSTABLE"
              ? "unstable"
              : mergeState === "CLEAN" || mergeState === "HAS_HOOKS"
                ? "clean"
                : "unknown";
  return {
    number: typeof raw.number === "number" ? raw.number : 0,
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
    awaitingReviewers: list(raw.reviewRequests).map(reviewerName).filter(Boolean),
    checks: summarizeChecks(raw.statusCheckRollup),
    merge,
    autoMerge: raw.autoMergeRequest !== null && typeof raw.autoMergeRequest === "object",
    additions: typeof raw.additions === "number" ? raw.additions : 0,
    deletions: typeof raw.deletions === "number" ? raw.deletions : 0,
    base: str(raw.baseRefName),
    head: str(raw.headRefName),
  };
}

function people(names: string[]): string {
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/** Every status a person acts on, in reading order: state, review, checks, mergeability, auto-merge, size. */
export function statusChips(pr: PullRequestStatus): StatusChip[] {
  const chips: StatusChip[] = [];
  const stateChip: Record<PullRequestStatus["state"], StatusChip> = {
    draft: { text: "Draft", tone: "neutral" },
    open: { text: "Open", tone: "success" },
    merged: { text: "Merged", tone: "merged" },
    closed: { text: "Closed", tone: "danger" },
  };
  chips.push(stateChip[pr.state]);
  const live = pr.state === "open" || pr.state === "draft";
  if (live) {
    if (pr.changesRequestedBy.length > 0 || pr.review === "changes_requested") {
      chips.push({ text: "Changes requested", tone: "danger", detail: people(pr.changesRequestedBy) || undefined });
    }
    if (pr.approvedBy.length > 0 || pr.review === "approved") {
      chips.push({ text: "Approved", tone: "success", detail: people(pr.approvedBy) || undefined });
    } else if (pr.review === "review_required") {
      chips.push({ text: "Review required", tone: "warning" });
    }
    if (pr.awaitingReviewers.length > 0) {
      chips.push({ text: "Awaiting review", tone: "warning", detail: people(pr.awaitingReviewers) });
    }
  }
  const { passed, failed, pending, failedNames } = pr.checks;
  if (failed > 0) {
    chips.push({ text: `${failed} check${failed === 1 ? "" : "s"} failed`, tone: "danger", detail: failedNames.join(", ") });
  }
  if (pending > 0 && live) chips.push({ text: `${pending} running`, tone: "warning" });
  if (failed === 0 && pending === 0 && passed > 0) chips.push({ text: "Checks passed", tone: "success" });
  if (live) {
    const mergeChip: Partial<Record<NonNullable<PullRequestStatus["merge"]>, StatusChip>> = {
      conflicts: { text: "Conflicts", tone: "danger" },
      behind: { text: "Behind base", tone: "warning" },
      blocked: { text: "Merge blocked", tone: "warning" },
      clean: { text: "Ready to merge", tone: "success" },
    };
    const chip = pr.merge === null ? undefined : mergeChip[pr.merge];
    if (chip && !(pr.merge === "clean" && pr.state === "draft")) chips.push(chip);
    if (pr.autoMerge) chips.push({ text: "Auto-merge on", tone: "info" });
  }
  chips.push({ text: `+${pr.additions} −${pr.deletions}`, tone: "neutral" });
  return chips;
}

/** The one status that fits beside the title: the most urgent thing the PR waits on. */
export function headline(pr: PullRequestStatus): StatusChip {
  if (pr.state === "merged") return { text: "Merged", tone: "merged" };
  if (pr.state === "closed") return { text: "Closed", tone: "danger" };
  if (pr.merge === "conflicts") return { text: "Conflicts", tone: "danger" };
  if (pr.checks.failed > 0) return { text: "Checks failed", tone: "danger" };
  if (pr.review === "changes_requested") return { text: "Changes requested", tone: "danger" };
  if (pr.checks.pending > 0) return { text: "Checks running", tone: "warning" };
  if (pr.state === "draft") return { text: "Draft", tone: "neutral" };
  if (pr.merge === "behind") return { text: "Behind base", tone: "warning" };
  if (pr.review === "review_required") return { text: "Needs review", tone: "warning" };
  if (pr.autoMerge) return { text: "Auto-merge on", tone: "info" };
  if (pr.merge === "clean") return { text: "Ready to merge", tone: "success" };
  if (pr.merge === "blocked") return { text: "Merge blocked", tone: "warning" };
  return { text: "Open", tone: "success" };
}
