// The collapsed-by-default PR and Automations sections: their header summaries and PR row glyphs.
import { automationDot, type AutomationSummary } from "./automations.ts";
import type { Attention, GithubFolderItem } from "./githubFolder.ts";
import { ATTENTION_LABEL } from "./githubFolder.ts";
import { PR_REASON_LOOK } from "./prAttention.ts";
import { formatUntil } from "./time.ts";

const COLLAPSED_BY_DEFAULT: ReadonlySet<string> = new Set(["github", "automations"]);

/** Default-collapsed sections store an "expanded" key, so their old collapse keys don't count. */
export function sectionToggleKey(section: string): string {
  return COLLAPSED_BY_DEFAULT.has(section) ? `${section}:expanded` : section;
}

export function isSectionCollapsed(stored: ReadonlySet<string>, section: string): boolean {
  const toggled = stored.has(sectionToggleKey(section));
  return COLLAPSED_BY_DEFAULT.has(section) ? !toggled : toggled;
}

export interface SummaryPart {
  text: string;
  tone: "bad" | "muted";
}

const PR_PROBLEMS: readonly { attention: Attention; word: string }[] = [
  { attention: "ci_failed", word: "failing" },
  { attention: "conflicts", word: "conflicts" },
  { attention: "changes_requested", word: "changes" },
];

export function pullRequestSummary(items: readonly GithubFolderItem[]): SummaryPart[] {
  const problems = PR_PROBLEMS.flatMap(({ attention, word }) => {
    const count = items.filter((item) => item.attention.includes(attention)).length;
    return count > 0 ? [{ text: `${count} ${word}`, tone: "bad" as const }] : [];
  });
  return [...problems, { text: String(items.length), tone: "muted" }];
}

export function automationsSummary(automations: readonly AutomationSummary[], now: number): SummaryPart[] {
  const active = automations.filter((automation) => automation.enabled);
  const failed = active.filter((automation) => automationDot(automation) === "error").length;
  const running = automations.filter((automation) => automationDot(automation) === "running").length;
  const next = Math.min(...active.map((automation) => automation.nextRunAt ?? Infinity));
  const parts: SummaryPart[] = [];
  if (failed > 0) parts.push({ text: `${failed} failed`, tone: "bad" });
  if (running > 0) parts.push({ text: `${running} running`, tone: "muted" });
  if (Number.isFinite(next)) {
    const until = formatUntil(next, now);
    parts.push({ text: until === "now" ? "due now" : `next ${until}`, tone: "muted" });
  }
  return parts.length > 0 ? parts : [{ text: String(active.length), tone: "muted" }];
}

const MUTED = "text-sidebar-foreground/60";

/** Most urgent first; the four a thread row also shows reuse its look. */
const ATTENTION_LOOK: readonly [Attention, { icon: string; className: string }][] = [
  ["ci_failed", PR_REASON_LOOK.failing],
  ["conflicts", PR_REASON_LOOK.conflicts],
  ["changes_requested", PR_REASON_LOOK.changes],
  ["ready", PR_REASON_LOOK.ready],
  ["review", { icon: "Eye", className: "text-blue-600 dark:text-blue-400" }],
  ["assigned", { icon: "UserRound", className: MUTED }],
  ["mentioned", { icon: "AtSign", className: MUTED }],
];

export interface PullRequestLook {
  reason: Attention | null;
  label: string;
  icon: string;
  className: string;
}

export function pullRequestLook(item: GithubFolderItem): PullRequestLook {
  const found = ATTENTION_LOOK.find(([attention]) => item.attention.includes(attention));
  if (found) {
    const [reason, look] = found;
    return { reason, ...look, label: ATTENTION_LABEL[reason] };
  }
  return {
    reason: null,
    label: item.pr.isDraft ? "Draft" : "Your pull request",
    icon: item.pr.isDraft ? "GitPullRequestDraft" : "GitPullRequest",
    className: "text-sidebar-foreground/45",
  };
}
