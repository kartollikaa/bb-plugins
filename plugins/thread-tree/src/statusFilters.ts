// The status line's counts, the flat lists they filter to, and `/` search.
import { familyRootOf } from "./sharedBranch.ts";
import { threadDotState, type TreeThread } from "./tree.ts";

export type StatusFilter = "input" | "error" | "running" | "unread";

export interface FilterThread extends TreeThread {
  isUnread: boolean;
  displayTitle: string;
  environment: { branchName: string | null } | null;
}

export const STATUS_FILTERS: readonly { id: StatusFilter; label: string; heading: string }[] = [
  { id: "input", label: "need input", heading: "Need input" },
  { id: "error", label: "failed", heading: "Failed" },
  { id: "running", label: "running", heading: "Running" },
  { id: "unread", label: "finished, not read", heading: "Finished, not read" },
];

export type StatusFilterCounts = Record<StatusFilter, number>;

export function statusSummary(counts: StatusFilterCounts): string {
  const parts = STATUS_FILTERS.filter(({ id }) => counts[id] > 0).map(({ id, label }) => `${counts[id]} ${label}`);
  return parts.length > 0 ? parts.join(", ") : "No threads need attention";
}

export function statusFilterOf(thread: FilterThread): StatusFilter | null {
  const state = threadDotState(thread);
  if (state === "input" || state === "error" || state === "running") return state;
  return thread.isUnread ? "unread" : null;
}

const isListed = (thread: FilterThread) => !thread.isHidden && !thread.isArchived;
const byActivity = (a: FilterThread, b: FilterThread) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);

export function countStatusFilters(threads: readonly FilterThread[]): StatusFilterCounts {
  const counts: StatusFilterCounts = { input: 0, error: 0, running: 0, unread: 0 };
  for (const thread of threads) {
    const filter = isListed(thread) ? statusFilterOf(thread) : null;
    if (filter) counts[filter] += 1;
  }
  return counts;
}

export function filterThreads<T extends FilterThread>(threads: readonly T[], filter: StatusFilter): T[] {
  return threads.filter((thread) => isListed(thread) && statusFilterOf(thread) === filter).sort(byActivity);
}

export interface SearchFacts {
  projectName: string | null;
  pullRequestNumbers: readonly number[];
}

/** Every word must appear in the title, branch, project name or a `#123` PR number. */
export function searchThreads<T extends FilterThread>(threads: readonly T[], query: string, describe: (thread: T) => SearchFacts): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return threads
    .filter((thread) => {
      if (thread.isHidden) return false;
      const facts = describe(thread);
      const haystack = [
        thread.displayTitle,
        thread.environment?.branchName ?? "",
        facts.projectName ?? "",
        ...facts.pullRequestNumbers.map((number) => `#${number}`),
      ].join("\n").toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort(byActivity);
}

/** The title of the orchestration a thread runs under: its family's root, null for a root itself. */
export function orchestrationTitle(threads: readonly FilterThread[]): (threadId: string) => string | null {
  const familyOf = familyRootOf(threads);
  const titleById = new Map(threads.map((thread) => [thread.id, thread.displayTitle]));
  return (threadId) => {
    const rootId = familyOf(threadId);
    return rootId === threadId ? null : titleById.get(rootId) ?? null;
  };
}

export function runningContext(projectName: string | null, parentTitle: string | null): string {
  return [projectName, parentTitle ? `under ${parentTitle}` : null].filter(Boolean).join(" · ");
}

export interface SearchKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  /** Focus is in a text field, where `/` is a character. */
  typing: boolean;
  /** A modal dialog has the page; the key belongs to it. */
  modalOpen: boolean;
}

export function isSearchKey(event: SearchKeyEvent): boolean {
  return event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.defaultPrevented && !event.isComposing && !event.typing && !event.modalOpen;
}

/** What just closed: a status filter's flat list, or the search box. */
export type ClosedView = { filter: StatusFilter } | { search: true };

/** Closing removes the focused control; without this, focus drops to `<body>` and Tab restarts from the page top. */
export function returnFocus(
  doc: { activeElement: unknown; body: unknown },
  root: { querySelector(selector: string): { focus(): void } | null },
  closed: ClosedView,
): boolean {
  if (doc.activeElement !== null && doc.activeElement !== doc.body) return false;
  const control = root.querySelector("filter" in closed ? `[data-status-filter="${closed.filter}"]` : "[data-thread-search-open]");
  control?.focus();
  return control !== null;
}
