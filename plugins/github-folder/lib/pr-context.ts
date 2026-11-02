import { z } from "zod";

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

export const prDetailsSchema = z.object({
  url: z.string(),
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  body: z.string(),
  state: z.enum(["open", "closed", "merged"]),
  isDraft: z.boolean(),
  author: z.string(),
  head: z.string(),
  base: z.string(),
  review: z.enum(["approved", "changes_requested", "review_required"]).nullable(),
  conflicts: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
  labels: z.array(z.string()),
  checks: z.object({ failed: z.array(z.string()), pending: z.number(), passed: z.number() }),
});
export type PrDetails = z.infer<typeof prDetailsSchema>;

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

export function cleanDescription(body: string): string {
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

/** Status chips for the card and the context: state, review, CI, conflicts. */
export function statusParts(pr: PrDetails): string[] {
  return [
    pr.state === "open" ? (pr.isDraft ? "Open, draft" : "Open") : pr.state === "merged" ? "Merged" : "Closed",
    pr.review ? REVIEW_LABEL[pr.review] : "",
    checksLine(pr.checks),
    pr.conflicts ? "Merge conflicts" : "",
  ].filter(Boolean);
}

/** Branch, author, size and labels on one line. */
export function detailParts(pr: PrDetails): string[] {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  return [
    pr.head && pr.base ? `${pr.head} → ${pr.base}` : "",
    pr.author ? `@${pr.author}` : "",
    `+${pr.additions} −${pr.deletions} in ${plural(pr.changedFiles, "file")}`,
    pr.labels.length > 0 ? `Labels: ${pr.labels.join(", ")}` : "",
  ].filter(Boolean);
}

/** The agent-only part of a new thread's first message: what the PR is, where it stands, what it says. */
export function agentContext(pr: PrDetails): string {
  return [
    `[github-folder] The user started this thread from pull request ${pr.repo}#${pr.number}. Their message is about it.`,
    `Title: ${pr.title}`,
    `URL: ${pr.url}`,
    `Status: ${statusParts(pr).join(" · ")}`,
    `Branch: ${detailParts(pr).join(" · ")}`,
    "Description:",
    cleanDescription(pr.body) || "(no description)",
    "",
    "Read more with `gh pr view` / `gh pr diff` / `gh pr checks` when the question needs it.",
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

/** The nav panel's URL segment: `/plugins/github-folder/pr/<owner>/<repo>/<number>`. */
export const PR_PANEL_PATH = "pr";

/** `owner/repo/number` for a PR URL, the page's subPath; null for anything that isn't a PR. */
export function prSubPath(url: string): string | null {
  const target = parsePrUrl(url);
  return target ? `${target.repo}/${target.number}` : null;
}

/** The PR URL a page subPath points at; null at the panel root or for a malformed path. */
export function prUrlFromSubPath(subPath: string): string | null {
  let segments: string[];
  try {
    segments = subPath.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (segments.length !== 3) return null;
  const url = `https://github.com/${segments[0]}/${segments[1]}/pull/${segments[2]}`;
  return parsePrUrl(url) ? url : null;
}

const PR_CACHE_MS = 120_000;

/** One read in flight per PR, answers reused for two minutes: a hover warms it, and signed image URLs (five minutes) stay valid. */
export function createPrReader<T>(read: (url: string) => Promise<T>) {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  return (url: string): Promise<T> => {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < PR_CACHE_MS) return hit.value;
    for (const [key, entry] of cache) if (Date.now() - entry.at >= PR_CACHE_MS) cache.delete(key);
    const value = read(url);
    cache.set(url, { at: Date.now(), value });
    value.catch(() => {
      if (cache.get(url)?.value === value) cache.delete(url);
    });
    return value;
  };
}

const ASSET_URL = /^https:\/\/github\.com\/user-attachments\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Asset id → signed image URL, from the `body_html` GitHub renders for a PR. */
export function signedImages(html: string): Record<string, string> {
  const images: Record<string, string> = {};
  for (const match of html.matchAll(/<img\s[^>]*?src="(https:\/\/private-user-images\.githubusercontent\.com\/[^"]+)"/g)) {
    const url = match[1]!.replace(/&amp;/g, "&");
    const id = /-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+\?/i.exec(url)?.[1];
    if (id) images[id.toLowerCase()] = url;
  }
  return images;
}

/**
 * The description as the card renders it: HTML `<img>` tags become Markdown images, and images
 * hosted on `github.com/user-attachments`, which need a GitHub session, go through `proxy`.
 */
export function displayDescription(body: string, proxy: (assetId: string) => string): string {
  const viaProxy = (url: string) => {
    const id = ASSET_URL.exec(url)?.[1];
    return id ? proxy(id) : url;
  };
  return cleanDescription(body)
    .replace(/<img\s[^>]*>/gi, (tag) => {
      const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      if (!src) return "";
      const alt = /\salt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? "";
      return `![${alt.replace(/[[\]]/g, "")}](${viaProxy(src)})`;
    })
    .replace(/(!\[[^\]]*\]\()([^)\s]+)/g, (_, prefix: string, url: string) => `${prefix}${viaProxy(url)}`);
}
