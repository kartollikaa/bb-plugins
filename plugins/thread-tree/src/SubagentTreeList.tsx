import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import {
  ThreadTitle,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_ThreadActionsMenu as ThreadActionsMenu,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreads as useSidebarThreads,
  useBbNavigate,
  useSdk,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginThreadActionTarget,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { SubagentBadge } from "./SubagentBadge";
import { StatusDot } from "./StatusDot";
import { formatAge } from "./time";
import {
  ancestorsOf,
  buildForest,
  groupRows,
  moveBefore,
  recentThreads,
  resolveProjectOrder,
  threadDotState,
  type DotState,
  type GroupMode,
  type TreeRow,
} from "./tree";
import { useSubagents, type ThreadSubagents } from "./useSubagents";
import { usePersistentChoice, usePersistentList, usePersistentSet } from "./usePersistentSet";

const ROW_PAD_PX = 6;
/** One level puts a child's status icon under its parent's title. */
const INDENT_PX = 24;

const RECENT_LIMIT = 5;
const RECENT_MORE_LIMIT = 15;

const GROUP_MODES: readonly { id: GroupMode; label: string; icon: React.ReactNode }[] = [
  { id: "project", label: "Project", icon: <Icon name="Folder" aria-hidden className="size-3.5" /> },
  {
    id: "status",
    label: "Status",
    icon: (
      <span className="flex size-3.5 items-center justify-center">
        <StatusDot state="running" className="size-2 animate-none" />
      </span>
    ),
  },
  { id: "none", label: "None", icon: <Icon name="Layers" aria-hidden className="size-3.5" /> },
];

type ProjectOrderMode = "fixed" | "activity";

const PROJECT_ORDER_MODES: readonly { id: ProjectOrderMode; label: string; icon: string }[] = [
  { id: "fixed", label: "Fixed", icon: "Pin" },
  { id: "activity", label: "Recent activity", icon: "Clock" },
];

const STATUS_GROUP_TITLE: Record<string, string> = {
  input: "Needs input",
  error: "Error",
  running: "Working",
  done: "Done",
};

export function SubagentTreeList({ activeThreadId, isCompactViewport, onNavigate }: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const navigate = useBbNavigate();
  const collapsedThreads = usePersistentSet("collapsed-threads");
  const collapsedGroups = usePersistentSet("collapsed-groups");
  const flags = usePersistentSet("flags");
  const [groupMode, setGroupMode] = usePersistentChoice<GroupMode>("group-mode", ["project", "status", "none"], "project");
  const [projectOrderMode, setProjectOrderMode] = usePersistentChoice<ProjectOrderMode>(
    "project-order-mode",
    ["fixed", "activity"],
    "fixed",
  );
  const [savedProjectOrder, setSavedProjectOrder] = usePersistentList("project-order");
  const [drag, setDrag] = useState<{ projectId: string; overId: string | null } | null>(null);
  const now = useNow(30_000);

  const forest = useMemo(() => buildForest(threads), [threads]);

  // Opening a nested thread from anywhere reveals it in the tree.
  useEffect(() => {
    if (!activeThreadId) return;
    const hidden = ancestorsOf(forest, activeThreadId).filter((id) => collapsedThreads.has(id));
    if (hidden.length > 0) collapsedThreads.remove(hidden);
  }, [activeThreadId, forest, collapsedThreads]);

  const projectOrder = useMemo(
    () => (projectOrderMode === "fixed" ? resolveProjectOrder(savedProjectOrder, projects) : null),
    [projectOrderMode, savedProjectOrder, projects],
  );
  const canReorder = groupMode === "project" && projectOrder !== null;
  const groups = useMemo(
    () => groupRows(forest, collapsedThreads.values, collapsedGroups.values, groupMode, projectOrder),
    [forest, collapsedThreads.values, collapsedGroups.values, groupMode, projectOrder],
  );
  const showMoreRecent = flags.has("recent-more");
  const recentCollapsed = collapsedGroups.has("recent");
  const recent = useMemo(
    () => recentThreads(threads, showMoreRecent ? RECENT_MORE_LIMIT : RECENT_LIMIT),
    [threads, showMoreRecent],
  );
  const visibleThreads = useMemo(() => {
    const byId = new Map<string, PluginSidebarThread>();
    if (!recentCollapsed) for (const thread of recent) byId.set(thread.id, thread);
    for (const group of groups) for (const row of group.rows) byId.set(row.thread.id, row.thread);
    return [...byId.values()];
  }, [groups, recent, recentCollapsed]);
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

  const renderRow = (row: TreeRow<PluginSidebarThread>, variant: "tree" | "recent") => (
    <ThreadRowView
      key={row.thread.id}
      row={row}
      variant={variant}
      context={variant === "recent" ? projectById.get(row.thread.projectId)?.name : undefined}
      isActive={row.thread.id === activeThreadId}
      isCompactViewport={isCompactViewport}
      subagents={subagents.get(row.thread.id)}
      now={now}
      onToggle={() => collapsedThreads.toggle(row.thread.id)}
      onOpen={open}
    />
  );

  return (
    <div className="flex flex-col gap-3 px-1.5 pb-3 pt-1">
      <section aria-label="Recent activity">
        <GroupHeader
          title="Recent Activity"
          icon={<Icon name="Clock" aria-hidden className="size-3.5" />}
          isCollapsed={recentCollapsed}
          count={recent.length}
          onToggle={() => collapsedGroups.toggle("recent")}
        />
        {recentCollapsed ? null : (
          <div role="list" className="mt-0.5 flex flex-col gap-0.5">
            {recent.map((thread) =>
              renderRow(
                {
                  thread,
                  depth: 0,
                  descendantCount: 0,
                  hasChildren: (forest.children.get(thread.id)?.length ?? 0) > 0,
                  isExpanded: false,
                  hiddenState: null,
                  guides: [],
                },
                "recent",
              ),
            )}
            {threads.length > RECENT_LIMIT ? (
              <button
                type="button"
                onClick={() => flags.toggle("recent-more")}
                className="ml-[26px] h-6 self-start rounded-md px-1 text-xs text-sidebar-foreground/45 hover:text-sidebar-foreground"
              >
                {showMoreRecent ? "Show less" : "Show more"}
              </button>
            ) : null}
          </div>
        )}
      </section>

      <div className="mx-1.5 border-t border-sidebar-border" />

      <div className="-mb-1 flex h-6 items-center justify-between px-1.5">
        <span className="text-xs font-medium text-sidebar-foreground/45">Threads</span>
        <GroupByMenu
          mode={groupMode}
          onChange={setGroupMode}
          projectOrderMode={projectOrderMode}
          onProjectOrderChange={setProjectOrderMode}
        />
      </div>

      <div role="tree" aria-label="Threads" className="flex flex-col gap-3">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.key);
          const project = group.projectId ? projectById.get(group.projectId) : undefined;
          const { title, icon } = groupLook(group.key, project, isCollapsed);
          const projectId = group.projectId;
          const reorderable = canReorder && projectId !== null;
          return (
            <section
              key={group.key}
              draggable={reorderable}
              onDragStart={(event) => {
                if (!reorderable) return;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", title);
                setDrag({ projectId, overId: null });
              }}
              onDragOver={(event) => {
                if (!drag || !reorderable) return;
                event.preventDefault();
                if (drag.overId !== projectId) setDrag({ ...drag, overId: projectId });
              }}
              onDrop={(event) => {
                if (!drag || !reorderable || !projectOrder) return;
                event.preventDefault();
                setSavedProjectOrder(moveBefore(projectOrder, drag.projectId, projectId));
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
              className={cn(
                "rounded-md",
                drag?.overId === projectId && drag.projectId !== projectId && "shadow-[inset_0_2px_0_0_var(--color-blue-500)]",
                drag?.projectId === projectId && "opacity-50",
              )}
            >
              <GroupHeader
                title={title}
                icon={icon}
                isCollapsed={isCollapsed}
                count={group.rootCount}
                onToggle={() => collapsedGroups.toggle(group.key)}
                onNewThread={
                  group.projectId
                    ? () => {
                        navigate.toCompose({ projectId: group.projectId!, focusPrompt: true });
                        onNavigate();
                      }
                    : undefined
                }
              />
              {isCollapsed ? null : <div role="group" className="mt-0.5 flex flex-col gap-0.5">{group.rows.map((row) => renderRow(row, "tree"))}</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function groupLook(
  key: string,
  project: PluginSidebarProject | undefined,
  isCollapsed: boolean,
): { title: string; icon: React.ReactNode } {
  if (key === "pinned") return { title: "Pinned", icon: <Icon name="Pin" aria-hidden className="size-3.5" /> };
  if (key === "all") return { title: "All threads", icon: <Icon name="Layers" aria-hidden className="size-3.5" /> };
  if (key.startsWith("status:")) {
    const state = key.slice("status:".length) as DotState;
    return {
      title: STATUS_GROUP_TITLE[state] ?? state,
      icon: (
        <span className="flex size-3.5 items-center justify-center">
          <StatusDot state={state} className="size-2" />
        </span>
      ),
    };
  }
  return {
    title: project?.name ?? "Unknown project",
    icon: <Icon name={isCollapsed ? "Folder" : "FolderOpen"} fallback="Folder" aria-hidden className="size-3.5" />,
  };
}

function GroupHeader({
  title,
  icon,
  isCollapsed,
  count,
  onToggle,
  onNewThread,
}: {
  title: string;
  icon: React.ReactNode;
  isCollapsed: boolean;
  count: number;
  onToggle: () => void;
  onNewThread?: () => void;
}) {
  return (
    <div className="group/header flex h-7 items-center gap-1 px-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground"
      >
        <span className="flex w-4 shrink-0 items-center justify-center text-sidebar-foreground/50">{icon}</span>
        <span className="truncate">{title}</span>
        {isCollapsed ? <span className="tabular-nums text-sidebar-foreground/40">{count}</span> : null}
        <Icon
          name="ChevronRight"
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-sidebar-foreground/40 opacity-0 transition group-hover/header:opacity-100",
            !isCollapsed && "rotate-90",
          )}
        />
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
  );
}

function GroupByMenu({
  mode,
  onChange,
  projectOrderMode,
  onProjectOrderChange,
}: {
  mode: GroupMode;
  onChange: (mode: GroupMode) => void;
  projectOrderMode: ProjectOrderMode;
  onProjectOrderChange: (mode: ProjectOrderMode) => void;
}) {
  const portalProps = usePortalScopeProps();
  const current = GROUP_MODES.find((entry) => entry.id === mode) ?? GROUP_MODES[0]!;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Group threads by ${current.label}`}
          className="flex h-5 items-center gap-1 rounded-md px-1.5 text-2xs text-sidebar-foreground/50 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
        >
          <Icon name="SlidersHorizontal" aria-hidden className="size-3" />
          {current.label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...portalProps}
          align="end"
          sideOffset={4}
          className="z-50 min-w-36 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.Label className="px-2 py-1 text-xs text-muted-foreground">Group by</DropdownMenu.Label>
          {GROUP_MODES.map((entry) => (
            <DropdownMenu.Item
              key={entry.id}
              onSelect={() => onChange(entry.id)}
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
            >
              <span className="flex text-muted-foreground">{entry.icon}</span>
              <span className="flex-1">{entry.label}</span>
              {entry.id === mode ? <Icon name="Check" aria-hidden className="size-3.5" /> : null}
            </DropdownMenu.Item>
          ))}
          {mode === "project" ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Label className="px-2 py-1 text-xs text-muted-foreground">Project order</DropdownMenu.Label>
              {PROJECT_ORDER_MODES.map((entry) => (
                <DropdownMenu.Item
                  key={entry.id}
                  onSelect={() => onProjectOrderChange(entry.id)}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <span className="flex text-muted-foreground">
                    <Icon name={entry.icon} aria-hidden className="size-3.5" />
                  </span>
                  <span className="flex-1">{entry.label}</span>
                  {entry.id === projectOrderMode ? <Icon name="Check" aria-hidden className="size-3.5" /> : null}
                </DropdownMenu.Item>
              ))}
              {projectOrderMode === "fixed" ? (
                <div className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">Drag a project to move it.</div>
              ) : null}
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ThreadRowView({
  row,
  variant,
  context,
  isActive,
  isCompactViewport,
  subagents,
  now,
  onToggle,
  onOpen,
}: {
  row: TreeRow<PluginSidebarThread>;
  /** A recent row is flat and leaves bb's keyboard shortcuts to the tree. */
  variant: "tree" | "recent";
  context?: string;
  isActive: boolean;
  isCompactViewport: boolean;
  subagents: ThreadSubagents | undefined;
  now: number;
  onToggle: () => void;
  onOpen: (thread: PluginSidebarThread, event: MouseEvent) => void;
}) {
  const { thread, depth } = row;
  const { splitProps } = useSidebarThreadSplit(thread.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const target = useMemo(() => toActionTarget(thread), [thread]);
  const isTree = variant === "tree";
  const leading = <StatusDot state={threadDotState(thread)} className="size-2" />;

  return (
    <ThreadActionsContextMenu thread={target}>
      <div
        role={isTree ? "treeitem" : "listitem"}
        aria-level={isTree ? depth + 1 : undefined}
        aria-expanded={isTree && row.hasChildren ? row.isExpanded : undefined}
        aria-selected={isTree ? isActive : undefined}
        title={context ? `${thread.displayTitle} · ${context}` : undefined}
        className={cn(
          "group/row relative flex h-8 items-center gap-2 rounded-md pr-2 text-sm text-sidebar-foreground/90",
          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60",
        )}
        style={{ paddingLeft: ROW_PAD_PX + depth * INDENT_PX }}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          // Portalled menus bubble through React; only clicks on the row itself open it.
          if (!event.currentTarget.contains(target) || target.closest("a, button")) return;
          onOpen(thread, event);
        }}
      >
        {isTree ? <TreeGuides depth={depth} guides={row.guides} hasOpenChildren={row.isExpanded} /> : null}
        <a
          href={thread.href}
          {...(isTree ? { "data-sidebar-thread-shortcut-target": "", "data-sidebar-thread-id": thread.id } : {})}
          aria-current={isActive ? "page" : undefined}
          aria-label={thread.displayTitle}
          {...splitProps}
          onClick={(event) => onOpen(thread, event)}
          className="flex min-w-0 items-center gap-2 self-stretch outline-none"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">{leading}</span>
          <span className={cn("min-w-0 truncate", thread.isUnread && "font-semibold text-sidebar-foreground")}>
            <ThreadTitle threadId={thread.id} />
          </span>
        </a>
        {isTree && row.hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-label={row.isExpanded ? "Collapse subthreads" : "Expand subthreads"}
            className="-ml-1 flex size-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Icon name="ChevronRight" aria-hidden className={cn("size-3.5 transition-transform", row.isExpanded && "rotate-90")} />
          </button>
        ) : null}
        <span aria-hidden className="min-w-0 flex-1" />
        {isTree && row.hasChildren && !row.isExpanded ? (
          <span
            className="flex shrink-0 items-center gap-1 text-2xs tabular-nums text-sidebar-foreground/50"
            title={`${row.descendantCount} subthread${row.descendantCount === 1 ? "" : "s"}`}
          >
            {row.hiddenState ? <StatusDot state={row.hiddenState} /> : null}
            {row.descendantCount}
          </span>
        ) : null}
        {thread.status === "error" ? <RetryButton threadId={thread.id} /> : null}
        <SubagentBadge thread={thread} data={subagents} />
        {/* Age and the actions button share one fixed slot, so hovering never reflows the title. */}
        <span className="relative flex h-5 w-8 shrink-0 items-center justify-end">
          <span
            className={cn(
              "text-2xs tabular-nums text-sidebar-foreground/45",
              !isCompactViewport && "group-hover/row:invisible",
              menuOpen && "invisible",
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
                  "absolute right-0 size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  // Touch opens the same menu by long-press, so compact rows keep the age instead.
                  isCompactViewport ? "hidden" : menuOpen ? "flex" : "hidden group-hover/row:flex",
                )}
              >
                <Icon name="MoreHorizontal" fallback="Ellipsis" aria-hidden className="size-3.5" />
              </button>
            )}
          />
        </span>
      </div>
    </ThreadActionsContextMenu>
  );
}

/** Re-submits the failed turn, the same as bb's own Retry in the thread. */
function RetryButton({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async (event) => {
        event.stopPropagation();
        setPending(true);
        try {
          await sdk.threads.retry({ threadId });
        } catch (error) {
          toast.error("Retry failed", { description: error instanceof Error ? error.message : String(error) });
        } finally {
          setPending(false);
        }
      }}
      aria-label="Retry the failed turn"
      className="flex h-5 shrink-0 items-center gap-1 rounded-full border border-destructive/40 px-1.5 text-2xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
    >
      <Icon name={pending ? "Loading" : "RotateCcw"} aria-hidden className="size-3" />
      Retry
    </button>
  );
}

/** Rows sit this far apart; continuing lines reach across the gap. */
const ROW_GAP_PX = 2;
const GLYPH_CENTER_PX = 8;

/** Connector lines: straight through levels that continue, an elbow at the row's own level. */
function TreeGuides({ depth, guides, hasOpenChildren }: { depth: number; guides: boolean[]; hasOpenChildren: boolean }) {
  const lineX = (level: number) => ROW_PAD_PX + level * INDENT_PX + GLYPH_CENTER_PX;
  const line = "pointer-events-none absolute border-sidebar-foreground/20";
  return (
    <>
      {guides.map((continues, level) => {
        const isOwn = level === depth - 1;
        if (!isOwn) {
          return continues ? (
            <span key={level} aria-hidden className={cn(line, "top-0 border-l")} style={{ left: lineX(level), bottom: -ROW_GAP_PX }} />
          ) : null;
        }
        return (
          <span key={level}>
            <span
              aria-hidden
              className={cn(line, "top-0 h-1/2 rounded-bl-md border-b border-l")}
              style={{ left: lineX(level), width: INDENT_PX - GLYPH_CENTER_PX - 2 }}
            />
            {continues ? (
              <span aria-hidden className={cn(line, "top-1/2 border-l")} style={{ left: lineX(level), bottom: -ROW_GAP_PX }} />
            ) : null}
          </span>
        );
      })}
      {hasOpenChildren ? (
        <span aria-hidden className={cn(line, "top-[23px] border-l")} style={{ left: lineX(depth), bottom: -ROW_GAP_PX }} />
      ) : null}
    </>
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
