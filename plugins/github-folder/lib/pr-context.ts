export const PR_VIEW_FIELDS = [
  "url",
  "number",
  "title",
  "body",
  "state",
  "isDraft",
  "author",
  "headRefName",
  "baseRefName",
  "reviewDecision",
  "mergeable",
  "additions",
  "deletions",
  "changedFiles",
  "labels",
  "statusCheckRollup",
] as const;

const BODY_LIMIT = 6_000;
const FAILED_NAMES_LIMIT = 5;

export interface PrDetails {
  url: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed" | "merged";
  isDraft: boolean;
  author: string;
  head: string;
  base: string;
  review: "approved" | "changes_requested" | "review_required" | null;
  conflicts: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  labels: string[];
  checks: { failed: string[]; pending: number; passed: number };
}

type Json = Record<string, unknown>;

function obj(value: unknown): Json {
  return typeof value === "object" && value !== null ? (value as Json) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** `owner/repo` and the number from a github.com pull request URL, or null for anything else. */
export function parsePrUrl(url: string): { repo: string; number: number } | null {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(url.trim());
  return match ? { repo: match[1]!, number: Number(match[2]) } : null;
}

function checksOf(rollup: unknown): PrDetails["checks"] {
  const checks = { failed: [] as string[], pending: 0, passed: 0 };
  for (const entry of Array.isArray(rollup) ? rollup.map(obj) : []) {
    // CheckRun reports status + conclusion; legacy StatusContext reports only state.
    const outcome = (str(entry.conclusion) || str(entry.state) || str(entry.status)).toUpperCase();
    const name = str(entry.name) || str(entry.context) || "check";
    if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(outcome)) checks.failed.push(name);
    else if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(outcome)) checks.passed += 1;
    else checks.pending += 1;
  }
  return checks;
}

/** `gh pr view --json <PR_VIEW_FIELDS>` output. */
export function parsePrView(raw: unknown): PrDetails {
  const node = obj(raw);
  const url = str(node.url);
  const state = str(node.state).toUpperCase();
  const decision = str(node.reviewDecision);
  return {
    url,
    repo: parsePrUrl(url)?.repo ?? "",
    number: num(node.number),
    title: str(node.title),
    body: str(node.body),
    state: state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open",
    isDraft: node.isDraft === true,
    author: str(obj(node.author).login),
    head: str(node.headRefName),
    base: str(node.baseRefName),
    review:
      decision === "APPROVED"
        ? "approved"
        : decision === "CHANGES_REQUESTED"
          ? "changes_requested"
          : decision === "REVIEW_REQUIRED"
            ? "review_required"
            : null,
    conflicts: str(node.mergeable) === "CONFLICTING",
    additions: num(node.additions),
    deletions: num(node.deletions),
    changedFiles: num(node.changedFiles),
    labels: Array.isArray(node.labels) ? node.labels.map((label) => str(obj(label).name)).filter(Boolean) : [],
    checks: checksOf(node.statusCheckRollup),
  };
}

function cleanBody(body: string): string {
  const text = body
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT).trimEnd()}\n… (truncated, see the PR for the rest)` : text;
}

function checksLine({ failed, pending, passed }: PrDetails["checks"]): string {
  if (failed.length > 0) {
    const names = failed.slice(0, FAILED_NAMES_LIMIT).join(", ") + (failed.length > FAILED_NAMES_LIMIT ? ", …" : "");
    return `CI: ${failed.length} failed (${names})`;
  }
  if (pending > 0) return `CI: ${pending} running`;
  if (passed > 0) return "CI: passed";
  return "";
}

const REVIEW_LABEL: Record<NonNullable<PrDetails["review"]>, string> = {
  approved: "Review: approved",
  changes_requested: "Review: changes requested",
  review_required: "Review: required",
};

/** The draft a new thread starts with: the PR's title, status and description, then room for the ask. */
export function composePrompt(pr: PrDetails): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const status = [
    pr.state === "open" ? (pr.isDraft ? "Open, draft" : "Open") : pr.state === "merged" ? "Merged" : "Closed",
    pr.review ? REVIEW_LABEL[pr.review] : "",
    checksLine(pr.checks),
    pr.conflicts ? "Merge conflicts" : "",
  ].filter(Boolean);
  const details = [
    pr.head && pr.base ? `Branch: ${pr.head} → ${pr.base}` : "",
    pr.author ? `by @${pr.author}` : "",
    `+${pr.additions} −${pr.deletions} in ${plural(pr.changedFiles, "file")}`,
    pr.labels.length > 0 ? `Labels: ${pr.labels.join(", ")}` : "",
  ].filter(Boolean);
  const body = cleanBody(pr.body);
  return [
    `Pull request ${pr.repo}#${pr.number}: ${pr.title}`,
    pr.url,
    `Status: ${status.join(" · ")}`,
    details.join(" · "),
    "",
    "Description:",
    body || "(no description)",
    "",
    "",
  ].join("\n");
}

/** `owner/repo` of a GitHub remote in any of its URL forms, lowercased; null for other hosts. */
export function githubRepoOfRemote(remote: string): string | null {
  const match = /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/git@|git@)github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(remote.trim());
  return match ? match[1]!.toLowerCase() : null;
}

/** The bb project whose git remote is the PR's repository, when exactly one is. */
export function projectForRepo(projects: readonly { id: string; gitRemoteUrl: string | null }[], repo: string): string | null {
  const wanted = repo.toLowerCase();
  const matches = projects.filter((project) => project.gitRemoteUrl !== null && githubRepoOfRemote(project.gitRemoteUrl) === wanted);
  return matches.length === 1 ? matches[0]!.id : null;
}
