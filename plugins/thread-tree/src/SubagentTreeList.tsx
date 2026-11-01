import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  ThreadTitle,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_ThreadActionsMenu as ThreadActionsMenu,
  experimental_ThreadStatusGlyph as ThreadStatusGlyph,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreads as useSidebarThreads,
  useBbNavigate,
  useSidebarThreadDraft,
  useSidebarThreadRowStatus,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginThreadActionTarget,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { SubagentBadge } from "./SubagentBadge";
import { formatAge } from "./time";
import { ancestorsOf, buildForest, groupRows, type TreeGroup, type TreeRow } from "./tree";
import { useSubagents, type ThreadSubagents } from "./useSubagents";
import { usePersistentSet } from "./usePersistentSet";

const INDENT_PX = 14;

export function SubagentTreeList({ activeThreadId, isCompactViewport, onNavigate }: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const navigate = useBbNavigate();
  const collapsedThreads = usePersistentSet("collapsed-threads");
  const collapsedGroups = usePersistentSet("collapsed-groups");
  const now = useNow(30_000);

  const forest = useMemo(() => buildForest(threads), [threads]);

  // Opening a nested thread from anywhere reveals it in the tree.
  useEffect(() => {
    if (!activeThreadId) return;
    const hidden = ancestorsOf(forest, activeThreadId).filter((id) => collapsedThreads.has(id));
    if (hidden.length > 0) collapsedThreads.remove(hidden);
  }, [activeThreadId, forest, collapsedThreads]);

  const groups = useMemo(
    () => groupRows(forest, collapsedThreads.values, collapsedGroups.values),
    [forest, collapsedThreads.values, collapsedGroups.values],
  );
  const visibleThreads = useMemo(() => groups.flatMap((group) => group.rows.map((row) => row.thread)), [groups]);
  const subagents = useSubagents(visibleThreads);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const open = useCallback(
    (thread: PluginSidebarThread, event: MouseEvent) => {
      if (event.button !== 0 || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate.toThread(thread.id, { split: event.metaKey || event.ctrlKey });
      onNavigate();
    },
    [navigate, onNavigate],
  );

  if (status === "loading" && threads.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">Loading threads…</div>;
  }
  if (status === "error" && threads.length === 0) {
    return <div className="px-3 py-2 text-xs text-destructive">Threads failed to load.</div>;
  }
  if (groups.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">No threads yet.</div>;
  }

  return (
    <div role="tree" aria-label="Threads" className="flex flex-col gap-2 px-1.5 pb-3 pt-1">
      {groups.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          project={group.projectId ? projectById.get(group.projectId) : undefined}
          isCollapsed={collapsedGroups.has(group.key)}
          onToggle={() => collapsedGroups.toggle(group.key)}
          onNewThread={
            group.projectId
              ? () => {
                  navigate.toCompose({ projectId: group.projectId!, focusPrompt: true });
                  onNavigate();
                }
              : undefined
          }
        >
          {group.rows.map((row) => (
            <ThreadRowView
              key={row.thread.id}
              row={row}
              isActive={row.thread.id === activeThreadId}
              isCompactViewport={isCompactViewport}
              subagents={subagents.get(row.thread.id)}
              now={now}
              onToggle={() => collapsedThreads.toggle(row.thread.id)}
              onOpen={open}
            />
          ))}
        </GroupSection>
      ))}
    </div>
  );
}

function GroupSection({
  group,
  project,
  isCollapsed,
  onToggle,
  onNewThread,
  children,
}: {
  group: TreeGroup<PluginSidebarThread>;
  project: PluginSidebarProject | undefined;
  isCollapsed: boolean;
  onToggle: () => void;
  onNewThread: (() => void) | undefined;
  children: React.ReactNode;
}) {
  const title = group.key === "pinned" ? "Pinned" : (project?.name ?? "Unknown project");
  return (
    <section>
      <div className="group/header flex h-7 items-center gap-1 px-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!isCollapsed}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md text-left text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground"
        >
          <Icon
            name="ChevronRight"
            aria-hidden
            className={cn("size-3 shrink-0 transition-transform", !isCollapsed && "rotate-90")}
          />
          <span className="truncate">{title}</span>
          {isCollapsed ? <span className="tabular-nums text-sidebar-foreground/40">{group.rootCount}</span> : null}
        </button>
        {onNewThread ? (
          <button
            type="button"
            onClick={onNewThread}
            aria-label={`New thread in ${title}`}
            className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 opacity-0 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/header:opacity-100"
          >
            <Icon name="Plus" aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>
      {isCollapsed ? null : <div role="group">{children}</div>}
    </section>
  );
}

function ThreadRowView({
  row,
  isActive,
  isCompactViewport,
  subagents,
  now,
  onToggle,
  onOpen,
}: {
  row: TreeRow<PluginSidebarThread>;
  isActive: boolean;
  isCompactViewport: boolean;
  subagents: ThreadSubagents | undefined;
  now: number;
  onToggle: () => void;
  onOpen: (thread: PluginSidebarThread, event: MouseEvent) => void;
}) {
  const { thread, depth } = row;
  const rowStatus = useSidebarThreadRowStatus(thread.id);
  const { hasUnsubmittedDraft } = useSidebarThreadDraft(thread.id);
  const { splitProps } = useSidebarThreadSplit(thread.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const indicator = thread.indicator === "none" && hasUnsubmittedDraft ? "draft" : thread.indicator;
  const target = useMemo(() => toActionTarget(thread), [thread]);

  return (
    <ThreadActionsContextMenu thread={target}>
      <div
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={row.hasChildren ? row.isExpanded : undefined}
        aria-selected={isActive}
        className={cn(
          "group/row relative flex h-8 items-center gap-1 rounded-md pr-1 text-sm text-sidebar-foreground/90",
          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60",
        )}
        style={{ paddingLeft: 4 + depth * INDENT_PX }}
      >
        {depth > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 border-l border-sidebar-border"
            style={{ left: 4 + (depth - 1) * INDENT_PX + 8 }}
          />
        ) : null}
        {row.hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={row.isExpanded ? "Collapse subthreads" : "Expand subthreads"}
            className="flex size-4 shrink-0 items-center justify-center rounded text-sidebar-foreground/50 hover:text-sidebar-foreground"
          >
            <Icon name="ChevronRight" aria-hidden className={cn("size-3 transition-transform", row.isExpanded && "rotate-90")} />
          </button>
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        <a
          href={thread.href}
          data-sidebar-thread-shortcut-target=""
          data-sidebar-thread-id={thread.id}
          aria-current={isActive ? "page" : undefined}
          aria-label={thread.displayTitle}
          {...splitProps}
          onClick={(event) => onOpen(thread, event)}
          className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch outline-none"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            <ThreadStatusGlyph indicator={indicator} rowStatus={rowStatus} size="compact" />
          </span>
          <span className={cn("min-w-0 flex-1 truncate", thread.isUnread && "font-semibold text-sidebar-foreground")}>
            <ThreadTitle threadId={thread.id} />
          </span>
        </a>
        {row.hasChildren && !row.isExpanded ? (
          <span
            className="flex shrink-0 items-center gap-1 text-2xs tabular-nums text-sidebar-foreground/50"
            title={`${row.descendantCount} subthread${row.descendantCount === 1 ? "" : "s"}`}
          >
            {row.hasHiddenActivity ? <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" /> : null}
            {row.descendantCount}
          </span>
        ) : null}
        <SubagentBadge thread={thread} data={subagents} />
        <span
          className={cn(
            "w-7 shrink-0 text-right text-2xs tabular-nums text-sidebar-foreground/45",
            !isCompactViewport && "group-hover/row:hidden",
            menuOpen && "hidden",
          )}
        >
          {formatAge(thread.updatedAt, now)}
        </span>
        <ThreadActionsMenu
          thread={target}
          onOpenChange={setMenuOpen}
          align="start"
          trigger={(props) => (
            <button
              type="button"
              aria-label="Thread actions"
              {...props}
              className={cn(
                "size-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                isCompactViewport || menuOpen ? "flex" : "hidden group-hover/row:flex",
              )}
            >
              <Icon name="MoreHorizontal" fallback="Ellipsis" aria-hidden className="size-3.5" />
            </button>
          )}
        />
      </div>
    </ThreadActionsContextMenu>
  );
}

function toActionTarget(thread: PluginSidebarThread): PluginThreadActionTarget {
  const environmentId = thread.environment?.id ?? null;
  return {
    id: thread.id,
    projectId: thread.projectId,
    parentThreadId: thread.parentThreadId,
    parentNotifications: thread.parentNotifications,
    archivedAt: thread.archivedAt,
    pinnedAt: thread.pinnedAt,
    sectionId: thread.sectionId,
    isUnread: thread.isUnread,
    status: thread.status,
    environment: environmentId ? { id: environmentId, path: thread.environment?.path ?? null } : null,
  };
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
