// The Needs you queue: what waits on the user, in the order the spec gives, with snooze "until it changes".
import { threadDotState } from "./tree.ts";
import type { FilterThread } from "./statusFilters.ts";
import { PR_REASON_LOOK, prActionReason, type FolderAttention, type PrReason } from "./prAttention.ts";
import { excludeDescendantPullRequests, type ThreadPullRequest } from "./threadPullRequests.ts";
import { ATTENTION_LABEL, type GithubFolderItem } from "./githubFolder.ts";
import { automationDot, type AutomationSummary } from "./automations.ts";
import type { NeedsYouPullRequests } from "./settings.ts";

export type ThreadItemKind = "input" | "failed" | "queued-failed" | "unread";
export type NeedsYouKind = ThreadItemKind | "pr" | "automation";

export interface NeedsYouThread extends FilterThread {
  queuedWork: string;
}

interface BaseItem {
  /** Stable per thing, so a snooze finds it again. */
  key: string;
  /** Changes when the item does; a snooze lasts until then. */
  signature: string;
  title: string;
  reason: string;
  /** The thread a click opens; null opens the item's own page. */
  threadId: string | null;
}

export interface ThreadItem extends BaseItem {
  kind: ThreadItemKind;
  threadId: string;
  /** When the thread started waiting on the user; only for questions. */
  since: number | null;
  orchestration: string | null;
  /** The thread's turn failed and can be re-submitted; an unread failure may have moved on. */
  canRetry: boolean;
}

export interface PullRequestItem extends BaseItem {
  kind: "pr";
  url: string;
  number: number;
  tone: PrReason | null;
}

export interface AutomationItem extends BaseItem {
  kind: "automation";
  automationId: string;
}

export type NeedsYouItem = ThreadItem | PullRequestItem | AutomationItem;

/** Which thread item a thread is, if any: a question outranks a failure, a failure a failed queued message, and those a result to read. */
export function threadItemKind(thread: NeedsYouThread): ThreadItemKind | null {
  if (thread.isHidden || thread.isArchived) return null;
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return "input";
  if (thread.status === "error" || thread.indicator === "unread-error") return "failed";
  if (thread.indicator === "queued-failed" || thread.queuedWork === "failed") return "queued-failed";
  if (thread.isUnread && threadDotState(thread) === "done") return "unread";
  return null;
}

/** The part of a pending interaction the queue reads; bb's records are parsed loosely. */
export interface PendingInteraction {
  createdAt: number;
  status: string;
  payload: {
    kind: string;
    title?: string;
    questions?: readonly { prompt: string }[];
    subject?: { kind: string; command?: string; presentation?: { label?: { pending?: string } } };
  };
}

export interface ThreadQuestion {
  text: string | null;
  since: number | null;
}

const APPROVAL_TEXT: Record<string, string> = {
  file_change: "Approve file changes",
  permission_grant: "Grant permissions",
  plan: "Approve the plan",
};

/** The oldest pending request's words, and when it was asked. */
export function describeQuestion(interactions: readonly PendingInteraction[]): ThreadQuestion {
  const pending = interactions.filter((entry) => entry.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
  const first = pending[0];
  if (!first) return { text: null, since: null };
  const { payload } = first;
  let text: string | null = null;
  if (payload.kind === "user_question") text = payload.questions?.[0]?.prompt ?? null;
  else if (payload.kind === "approval") {
    const subject = payload.subject;
    text = subject?.kind === "command" && subject.command
      ? `Approve: ${subject.command}`
      : subject?.kind === "tool_use" && subject.presentation?.label?.pending
        ? `Approve: ${subject.presentation.label.pending}`
        : APPROVAL_TEXT[subject?.kind ?? ""] ?? "Approve a request";
  } else if (payload.title) text = payload.title;
  const extra = pending.length - 1;
  return { text: text && extra > 0 ? `${text} (+${extra} more)` : text, since: first.createdAt };
}

const THREAD_REASON: Record<Exclude<ThreadItemKind, "input">, string> = {
  failed: "Last turn failed",
  "queued-failed": "A queued message failed to send",
  unread: "Finished · review the result",
};

export interface ThreadItemsInput<T extends NeedsYouThread> {
  threads: readonly T[];
  questions: ReadonlyMap<string, ThreadQuestion>;
  /** When the client first saw a thread need input; the fallback wait for a question bb gave no time for. */
  firstSeen: ReadonlyMap<string, number>;
  orchestrationOf: (threadId: string) => string | null;
}

const KIND_ORDER: readonly ThreadItemKind[] = ["input", "failed", "queued-failed", "unread"];

/** Questions first, longest wait first; then failures, failed queued messages and results, most recent first. */
export function threadItems<T extends NeedsYouThread>({ threads, questions, firstSeen, orchestrationOf }: ThreadItemsInput<T>): ThreadItem[] {
  const items: (ThreadItem & { updatedAt: number })[] = [];
  for (const thread of threads) {
    const kind = threadItemKind(thread);
    if (!kind) continue;
    const question = kind === "input" ? questions.get(thread.id) : undefined;
    items.push({
      kind,
      key: `thread:${thread.id}`,
      signature: `${kind}:${thread.updatedAt}`,
      threadId: thread.id,
      title: thread.displayTitle,
      reason: kind === "input" ? question?.text ?? "Needs your input" : THREAD_REASON[kind],
      since: kind === "input" ? question?.since ?? firstSeen.get(thread.id) ?? null : null,
      orchestration: orchestrationOf(thread.id),
      canRetry: kind === "failed" && thread.status === "error",
      updatedAt: thread.updatedAt,
    });
  }
  items.sort((a, b) =>
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    (a.kind === "input" ? (a.since ?? Infinity) - (b.since ?? Infinity) : b.updatedAt - a.updatedAt) ||
    a.key.localeCompare(b.key));
  return items.map(({ updatedAt: _updatedAt, ...item }) => item);
}

/** Waiting threads whose pending requests weren't read at their current update. */
export function questionsToRead(waiting: readonly { id: string; updatedAt: number }[], readAt: ReadonlyMap<string, number>): string[] {
  return waiting.filter((thread) => readAt.get(thread.id) !== thread.updatedAt).map((thread) => thread.id);
}

/** Today's first-seen times for threads that need input: kept while they wait, dropped once they don't. */
export function trackFirstSeen(previous: ReadonlyMap<string, number>, waitingIds: readonly string[], now: number): Map<string, number> {
  return new Map(waitingIds.map((id) => [id, previous.get(id) ?? now]));
}

/** Agents can act on these; Ready to merge stays a row icon. */
const QUEUE_PR_REASONS = new Set<PrReason>(["failing", "conflicts", "changes"]);

export interface LinkedPullRequests {
  threadId: string;
  /** The thread's own PRs, without the ones a subthread also links. */
  pullRequests: readonly ThreadPullRequest[];
}

export function linkedPullRequests(
  threadIds: readonly string[],
  pullRequestsOf: (threadId: string) => readonly ThreadPullRequest[],
  descendantIdsOf: (threadId: string) => readonly string[],
): LinkedPullRequests[] {
  return threadIds.flatMap((threadId) => {
    const own = pullRequestsOf(threadId);
    return own.length === 0 ? [] : [{ threadId, pullRequests: excludeDescendantPullRequests(own, descendantIdsOf(threadId).flatMap(pullRequestsOf)) }];
  });
}

export function pullRequestItems(
  mode: NeedsYouPullRequests,
  linked: readonly LinkedPullRequests[],
  folder: FolderAttention,
  folderItems: readonly GithubFolderItem[],
): PullRequestItem[] {
  if (mode === "none") return [];
  const threadOf = new Map<string, string>();
  const linkedPr = new Map<string, ThreadPullRequest>();
  for (const { threadId, pullRequests } of linked) {
    for (const pr of pullRequests) {
      if (threadOf.has(pr.url.toLowerCase())) continue;
      threadOf.set(pr.url.toLowerCase(), threadId);
      linkedPr.set(pr.url.toLowerCase(), pr);
    }
  }
  if (mode === "all") {
    return folderItems.map((item) => {
      const attention = item.attention[0];
      return {
        kind: "pr",
        key: `pr:${item.pr.url.toLowerCase()}`,
        signature: prSignature(folder.get(item.pr.url.toLowerCase()) ?? item.attention, linkedPr.get(item.pr.url.toLowerCase())),
        threadId: threadOf.get(item.pr.url.toLowerCase()) ?? null,
        title: item.pr.title,
        reason: `#${item.pr.number} · ${attention ? ATTENTION_LABEL[attention] : item.pr.repo}`,
        url: item.pr.url,
        number: item.pr.number,
        tone: null,
      };
    });
  }
  const items = new Map<string, PullRequestItem & { rank: number }>();
  for (const { threadId, pullRequests } of linked) {
    for (const pr of pullRequests) {
      const url = pr.url.toLowerCase();
      const reason = prActionReason(pr, folder);
      if (!reason || !QUEUE_PR_REASONS.has(reason) || items.has(url)) continue;
      items.set(url, {
        kind: "pr",
        key: `pr:${url}`,
        signature: prSignature(folder.get(url) ?? [], pr),
        threadId,
        title: pr.title,
        reason: `#${pr.number} · ${PR_REASON_LOOK[reason].label}`,
        url: pr.url,
        number: pr.number,
        tone: reason,
        rank: [...QUEUE_PR_REASONS].indexOf(reason),
      });
    }
  }
  return [...items.values()].sort((a, b) => a.rank - b.rank || a.number - b.number).map(({ rank: _rank, ...item }) => item);
}

/** The same in either PR setting, so switching it keeps a snooze. */
function prSignature(attention: readonly string[], pr: ThreadPullRequest | undefined): string {
  const signals = new Set(attention);
  if (pr && pr.state !== "unknown" && pr.checks.state === "failing") signals.add("checks_failing");
  if (pr?.attention === "conflicts") signals.add("conflicts");
  return `pr:${[...signals].sort().join(",")}`;
}

/** Enabled automations whose last run failed, most recent first; paused ones stay in their section. */
export function automationItems(automations: readonly AutomationSummary[]): AutomationItem[] {
  return automations
    .filter((automation) => automation.enabled && automationDot(automation) === "error")
    .sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0) || a.name.localeCompare(b.name))
    .map((automation) => ({
      kind: "automation",
      key: `automation:${automation.id}`,
      signature: `automation:${automation.lastRunAt ?? ""}`,
      threadId: automation.lastRunThreadId,
      automationId: automation.id,
      title: automation.name,
      reason: automation.lastError ? `Last run failed: ${automation.lastError}` : "Last run failed",
    }));
}

export type Snoozes = Readonly<Record<string, string>>;

export function isSnoozed(item: NeedsYouItem, snoozes: Snoozes): boolean {
  return snoozes[item.key] === item.signature;
}

/** Drops snoozes whose item changed, so a later return of the same signature isn't hidden; keeps absent ones, whose source may still be loading. */
export function pruneSnoozes(snoozes: Snoozes, items: readonly NeedsYouItem[], limit = 200): Snoozes {
  const current = new Map(items.map((item) => [item.key, item.signature]));
  const kept = Object.entries(snoozes).filter(([key, signature]) => (current.get(key) ?? signature) === signature);
  return Object.fromEntries(kept.slice(-limit));
}

export function readSnoozes(raw: unknown): Snoozes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export interface QueuedMessageRow {
  id: string;
  state: string;
  createdAt: number;
}

export function failedQueuedMessage<T extends QueuedMessageRow>(rows: readonly T[]): T | null {
  return rows.filter((row) => row.state.startsWith("failed_")).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

export type ItemTarget = { kind: "thread"; threadId: string } | { kind: "pr"; url: string } | { kind: "automations" };

export function itemTarget(item: NeedsYouItem): ItemTarget {
  if (item.threadId) return { kind: "thread", threadId: item.threadId };
  return item.kind === "pr" ? { kind: "pr", url: item.url } : { kind: "automations" };
}

/** Where the last ⇧⌘I left off; it holds while the user stays where it took them. */
export interface InboxCursor {
  key: string;
  index: number;
  threadId: string | null;
}

/** ⇧⌘I: the item after the last one opened, else after the open thread's items, wrapping; the first when neither is in the queue. */
export function nextItem(items: readonly NeedsYouItem[], activeThreadId: string | null, cursor: InboxCursor | null = null): NeedsYouItem | null {
  if (items.length === 0) return null;
  if (cursor && cursor.threadId === activeThreadId) {
    const at = items.findIndex((item) => item.key === cursor.key);
    const start = at >= 0 ? at + 1 : cursor.index;
    for (let step = 0; step < items.length; step++) {
      const item = items[(start + step) % items.length]!;
      if (!activeThreadId || item.threadId !== activeThreadId) return item;
    }
    return items[start % items.length] ?? null;
  }
  let last = -1;
  items.forEach((item, index) => {
    if (activeThreadId && item.threadId === activeThreadId) last = index;
  });
  return items[(last + 1) % items.length] ?? null;
}
