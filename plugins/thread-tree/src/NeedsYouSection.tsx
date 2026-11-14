import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBbNavigate, useSdk, type PluginSidebarThread, type PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  automationItems,
  describeQuestion,
  questionsToRead,
  isSnoozed,
  cursorThreadId,
  itemTarget,
  linkedPullRequests,
  linkedThreadByUrl,
  nextItem,
  pruneSnoozes,
  pullRequestItems,
  readSnoozes,
  threadItemKind,
  threadItems,
  trackFirstSeen,
  type InboxCursor,
  type NeedsYouItem,
  type PendingInteraction,
  type ThreadItemKind,
  type ThreadQuestion,
} from "./needsYou";
import { PR_REASON_LOOK, type FolderAttention } from "./prAttention";
import type { ThreadPullRequest } from "./threadPullRequests";
import type { GithubFolderItem } from "./githubFolder";
import type { AutomationSummary } from "./automations";
import type { NeedsYouPullRequests } from "./settings";
import { openGithubFolderPrPage } from "./GithubSection";
import { useOpenAutomationsPage } from "./AutomationsSection";
import { setInboxHandler } from "./inbox";
import { usePersistentRecord } from "./usePersistentSet";
import { GroupHeader } from "./GroupHeader";
import { Collapse } from "./Collapse";
import { StillGlyph } from "./ThreadGlyph";
import { StatusDot } from "./StatusDot";
import { ResendButton, RetryButton } from "./RetryButton";
import { formatAge } from "./time";
import { actionsInline, ROW_ACTION_BUTTON, hoverActionsClass, rowHeightPx, STRIP_END_PAD_PX, STRIP_GAP_PX } from "./rowActions";
import { ROW_FADE_ACTIVE, ROW_FADE_GRADIENT, ROW_FADE_HOVER, ROW_FADE_SOLID, ROW_TINT } from "./rowStyles";

/** The strip repeats the pill beside Snooze, so the row's own copy steps aside under it. */
const HIDDEN_UNDER_STRIP = "group-hover/row:invisible group-data-[keyboard-focus]/row:invisible";

const THREAD_GLYPH: Record<ThreadItemKind, PluginSidebarThreadIndicator> = {
  input: "waiting-for-input",
  failed: "unread-error",
  "queued-failed": "queued-failed",
  unread: "unread-success",
};

interface NeedsYouSources {
  threads: readonly PluginSidebarThread[];
  descendantIdsOf: (threadId: string) => readonly string[];
  pullRequestsOf: (thread: PluginSidebarThread) => ThreadPullRequest[];
  folderAttention: FolderAttention;
  folderItems: readonly GithubFolderItem[];
  automations: readonly AutomationSummary[];
  pullRequestMode: NeedsYouPullRequests;
  pullRequestsSettled: boolean;
  orchestrationOf: (threadId: string) => string | null;
  activeThreadId: string | null;
  onNavigate: () => void;
}

/** The queue's visible items, snoozing, and ⇧⌘I, which works while the section is folded or replaced by a flat list. */
export function useNeedsYou(sources: NeedsYouSources) {
  const { threads, activeThreadId, descendantIdsOf, pullRequestsOf, folderAttention, folderItems, automations, pullRequestMode, pullRequestsSettled, orchestrationOf, onNavigate } = sources;
  const waiting = useMemo(() => threads.filter((thread) => threadItemKind(thread) === "input"), [threads]);
  const questions = useQuestions(waiting);
  const firstSeenRef = useRef<ReadonlyMap<string, number>>(new Map());
  const firstSeen = useMemo(() => (firstSeenRef.current = trackFirstSeen(firstSeenRef.current, waiting.map((thread) => thread.id), Date.now())), [waiting]);

  const linked = useMemo(() => {
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    const prsOf = (threadId: string) => {
      const thread = byId.get(threadId);
      return thread ? pullRequestsOf(thread) : [];
    };
    return linkedPullRequests(threads.map((thread) => thread.id), prsOf, descendantIdsOf);
  }, [threads, pullRequestsOf, descendantIdsOf]);
  const threadOfPullRequest = useMemo(() => linkedThreadByUrl(linked), [linked]);

  const all = useMemo(
    () => [
      ...threadItems({ threads, questions, firstSeen, orchestrationOf }),
      ...(pullRequestMode === "none" ? [] : pullRequestItems(pullRequestMode, linked, folderAttention, folderItems, threadOfPullRequest)),
      ...automationItems(automations),
    ],
    [threads, questions, firstSeen, orchestrationOf, pullRequestMode, linked, folderAttention, folderItems, threadOfPullRequest, automations],
  );

  const [snoozes, saveSnooze] = usePersistentRecord("needs-you-snoozes", readSnoozes);
  const settled = useCallback((item: NeedsYouItem) => item.kind !== "pr" || pullRequestsSettled, [pullRequestsSettled]);
  useEffect(() => {
    const kept = pruneSnoozes(snoozes, all, { settled });
    for (const key of Object.keys(snoozes)) if (!(key in kept)) saveSnooze(key, undefined);
  }, [all, snoozes, saveSnooze, settled]);
  const items = useMemo(() => all.filter((item) => !isSnoozed(item, snoozes, settled)), [all, snoozes, settled]);

  const navigate = useBbNavigate();
  const openAutomationsPage = useOpenAutomationsPage(onNavigate);
  const cursor = useRef<InboxCursor | null>(null);
  const open = (item: NeedsYouItem, split = false, viewThreadId = activeThreadId) => {
    const target = itemTarget(item);
    cursor.current = { key: item.key, index: Math.max(0, items.indexOf(item)), threadId: cursorThreadId(target, viewThreadId) };
    if (target.kind === "thread") {
      navigate.toThread(target.threadId, { split });
      onNavigate();
    } else if (target.kind === "pr") {
      openGithubFolderPrPage(target.url);
      onNavigate();
    } else openAutomationsPage();
  };
  const snooze = (item: NeedsYouItem) => {
    saveSnooze(item.key, item.signature);
    toast("Snoozed until it changes", {
      description: item.title,
      action: { label: "Undo", onClick: () => saveSnooze(item.key, undefined) },
    });
  };

  const latest = useRef({ items, open });
  latest.current = { items, open };
  useEffect(() => setInboxHandler((threadId) => {
    const { items: current, open: openItem } = latest.current;
    const item = nextItem(current, threadId, cursor.current);
    if (item) openItem(item, false, threadId);
    else toast(current.length > 0 ? "Nothing else needs you" : "Nothing needs you");
    return item !== null;
  }), []);

  return { items, open, snooze, threadOfPullRequest };
}

const QUESTION_RETRY_MS = 10_000;

/** Pending requests of the threads that need input, read again only for a thread that changed. */
function useQuestions(waitingThreads: readonly PluginSidebarThread[]): ReadonlyMap<string, ThreadQuestion> {
  const sdk = useSdk();
  const [questions, setQuestions] = useState<ReadonlyMap<string, ThreadQuestion>>(new Map());
  const readAt = useRef(new Map<string, number>());
  const [retryRound, setRetryRound] = useState(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const waitingKey = waitingThreads
    .map((thread) => `${thread.id}@${thread.updatedAt}`)
    .sort()
    .join();
  useEffect(() => {
    const waiting = waitingKey
      ? waitingKey.split(",").map((entry) => {
          const at = entry.lastIndexOf("@");
          return { id: entry.slice(0, at), updatedAt: Number(entry.slice(at + 1)) };
        })
      : [];
    const ids = new Set(waiting.map((thread) => thread.id));
    for (const id of [...readAt.current.keys()]) if (!ids.has(id)) readAt.current.delete(id);
    setQuestions((previous) => ([...previous.keys()].every((id) => ids.has(id)) ? previous : new Map([...previous].filter(([id]) => ids.has(id)))));
    for (const id of questionsToRead(waiting, readAt.current)) {
      const updatedAt = waiting.find((thread) => thread.id === id)!.updatedAt;
      readAt.current.set(id, updatedAt);
      sdk.threads.interactions.list({ threadId: id }).then(
        (pending) => {
          if (readAt.current.get(id) === updatedAt) setQuestions((previous) => new Map(previous).set(id, describeQuestion(pending as unknown as PendingInteraction[])));
        },
        () => {
          if (readAt.current.get(id) !== updatedAt) return;
          readAt.current.delete(id);
          retryTimer.current ??= window.setTimeout(() => {
            retryTimer.current = undefined;
            setRetryRound((round) => round + 1);
          }, QUESTION_RETRY_MS);
        },
      );
    }
  }, [sdk, waitingKey, retryRound]);
  useEffect(() => () => window.clearTimeout(retryTimer.current), []);
  return questions;
}

export function NeedsYouSection({
  items,
  isCollapsed,
  onToggle,
  activeThreadId,
  isCompactViewport,
  canHover,
  reduceMotion,
  now,
  onOpen,
  onSnooze,
}: {
  items: readonly NeedsYouItem[];
  isCollapsed: boolean;
  onToggle: () => void;
  activeThreadId: string | null;
  isCompactViewport: boolean;
  canHover: boolean;
  reduceMotion: boolean;
  now: number;
  onOpen: (item: NeedsYouItem, split: boolean) => void;
  onSnooze: (item: NeedsYouItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Needs you" data-needs-you="">
      <GroupHeader
        title="Needs you"
        icon={<Icon name="Inbox" aria-hidden className="size-3.5" />}
        isCollapsed={isCollapsed}
        count={items.length}
        onToggle={onToggle}
      />
      <Collapse open={!isCollapsed}>
        <div role="list" className="mt-0.5 flex flex-col gap-0.5">
          {items.map((item) => (
            <NeedsYouRow
              key={item.key}
              item={item}
              isActive={item.threadId !== null && item.threadId === activeThreadId}
              isCompactViewport={isCompactViewport}
              inlineActions={actionsInline({ isCompactViewport, canHover })}
              reduceMotion={reduceMotion}
              now={now}
              onOpen={(split) => onOpen(item, split)}
              onSnooze={() => onSnooze(item)}
            />
          ))}
        </div>
      </Collapse>
    </section>
  );
}

function NeedsYouRow({
  item,
  isActive,
  isCompactViewport,
  inlineActions,
  reduceMotion,
  now,
  onOpen,
  onSnooze,
}: {
  item: NeedsYouItem;
  isActive: boolean;
  isCompactViewport: boolean;
  inlineActions: boolean;
  reduceMotion: boolean;
  now: number;
  onOpen: (split: boolean) => void;
  onSnooze: () => void;
}) {
  const sdk = useSdk();
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const reason = item.kind !== "pr" && item.kind !== "automation" && item.orchestration ? `${item.reason} · under ${item.orchestration}` : item.reason;
  const wait = item.kind === "input" && item.since !== null ? formatAge(item.since, now) : null;
  const markRead = item.kind === "unread"
    ? () => void sdk.threads.markRead({ threadId: item.threadId }).catch((error: unknown) =>
        toast.error("Couldn't mark it read", { description: error instanceof Error ? error.message : String(error) }))
    : null;
  const failure = item.kind === "failed" && item.canRetry ? <RetryButton threadId={item.threadId} /> : item.kind === "queued-failed" ? <ResendButton threadId={item.threadId} /> : null;
  const actionButtons = (
    <>
      {failure ? <span className="pointer-events-auto flex">{failure}</span> : null}
      {markRead ? <OverlayButton label="Mark read" icon="CheckCheck" fallback="Check" onClick={markRead} /> : null}
      <OverlayButton label="Snooze until it changes" icon="BellOff" fallback="Clock" onClick={onSnooze} />
    </>
  );
  return (
    <div
      role="listitem"
      data-needs-you-item={item.kind}
      title={`${item.title}\n${reason}`}
      data-keyboard-focus={keyboardFocus || undefined}
      className={cn(
        "group/row relative flex items-center gap-2 rounded-md pl-1.5 pr-2 text-sm text-sidebar-foreground/90",
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ROW_TINT,
      )}
      style={{ height: rowHeightPx(isCompactViewport, 2) }}
      onFocus={(event) => setKeyboardFocus(event.target.matches(":focus-visible"))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocus(false);
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        onOpen(event.metaKey || event.ctrlKey);
      }}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <ItemGlyph item={item} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={(event) => onOpen(event.metaKey || event.ctrlKey)}
            className="min-w-0 flex-1 truncate text-left outline-none focus-visible:underline"
          >
            {item.title}
          </button>
          {wait ? <span data-needs-you-wait="" className="shrink-0 text-2xs tabular-nums text-sidebar-foreground/45">{wait}</span> : null}
        </span>
        <span data-row-subtitle="" className="truncate text-2xs text-sidebar-foreground/50">{reason}</span>
      </span>
      {failure && !inlineActions ? <span className={cn("flex shrink-0", HIDDEN_UNDER_STRIP)}>{failure}</span> : null}
      {inlineActions ? (
        <span data-inline-actions="" className="relative z-[1] flex shrink-0 items-center" style={{ gap: STRIP_GAP_PX }}>
          {actionButtons}
        </span>
      ) : (
        <span
          data-hover-actions=""
          className={cn("absolute inset-y-0 right-0 flex items-center rounded-r-md", isActive ? ROW_FADE_ACTIVE : ROW_FADE_HOVER, hoverActionsClass(reduceMotion))}
        >
          <span aria-hidden className={cn("h-full w-6", ROW_FADE_GRADIENT)} />
          <span className={cn("flex h-full items-center", ROW_FADE_SOLID)} style={{ gap: STRIP_GAP_PX, paddingRight: STRIP_END_PAD_PX }}>
            {actionButtons}
          </span>
        </span>
      )}
    </div>
  );
}

function ItemGlyph({ item }: { item: NeedsYouItem }) {
  if (item.kind === "automation") return <StatusDot state="error" className="size-2" />;
  if (item.kind === "pr") {
    const look = item.tone ? PR_REASON_LOOK[item.tone] : null;
    return <Icon name={look?.icon ?? "GitPullRequest"} aria-hidden className={cn("size-3.5", look?.className ?? "text-sidebar-foreground/60")} />;
  }
  return <StillGlyph indicator={THREAD_GLYPH[item.kind]} />;
}

function OverlayButton({ label, icon, fallback, onClick }: { label: string; icon: string; fallback: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={ROW_ACTION_BUTTON}
    >
      <Icon name={icon} fallback={fallback} aria-hidden className="size-3.5" />
    </button>
  );
}
