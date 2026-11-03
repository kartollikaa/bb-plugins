import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import {
  ThreadTitle,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_ThreadActionsMenu as ThreadActionsMenu,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useThreadActions as useThreadActions,
  useBbNavigate,
  useSdk,
  useSettings,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginThreadActionTarget,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { SubagentBadge } from "./SubagentBadge";
import { GroupHeader } from "./GroupHeader";
import { ROW_HOVER_SOLID_BG } from "./rowStyles";
import { AutomationsSection } from "./AutomationsSection";
import { GithubSection } from "./GithubSection";
import { StatusDot } from "./StatusDot";
import { readViewSettings, type ViewSettings } from "./settings";
import { formatAge } from "./time";
import {
  buildForest,
  groupRows,
  moveBefore,
  recentThreads,
  resolveProjectOrder,
  threadDotState,
  type DotState,
  type GroupMode,
  type StateCounts,
  type TreeRow,
} from "./tree";
import { useSubagents, type ThreadSubagents } from "./useSubagents";
import { usePersistentChoice, usePersistentList, usePersistentSet } from "./usePersistentSet";

const ROW_PAD_PX = 6;
/** One level puts a child's status icon under its parent's title. */
const INDENT_PX = 24;

const ARCHIVE_ACTION_KEY = "bb--core/archive";
/** How far the hover actions reach in from the row's right edge, plus breathing room. */
const HOVER_ACTIONS_REACH_PX = 58;
/** The row's right padding plus the gap before the age label. */
const ROW_END_PAD_PX = 16;
const SLIDE_ON_HOVER = "group-hover/row:[transform:translateX(calc(var(--slide)*-1))]";
const SLIDE_NOW = "[transform:translateX(calc(var(--slide)*-1))]";
const ROW_HOVER_SOLID_BG_ON_HOVER = "group-hover/row:bg-[color-mix(in_oklab,var(--sidebar-accent)_60%,var(--sidebar))]";

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

type Lifecycle = "active" | "archived";

/** Stable options objects, so the host query is not re-subscribed on every render. */
const LIFECYCLE_QUERY: Record<Lifecycle, { experimental_lifecycles: readonly Lifecycle[] }> = {
  active: { experimental_lifecycles: ["active"] },
  archived: { experimental_lifecycles: ["archived"] },
};

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

export function ThreadTreeList({ activeThreadId, isCompactViewport, onNavigate }: PluginThreadListProps) {
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
  const [lifecycle, setLifecycle] = usePersistentChoice<Lifecycle>("lifecycle", ["active", "archived"], "active");
  const listed = useSidebarThreads(LIFECYCLE_QUERY[lifecycle]);
  const showArchived = lifecycle === "archived";
  const archivedPages = showArchived ? listed.experimental_archived : null;
  const treeThreads = showArchived ? listed.threads : threads;
  const [drag, setDrag] = useState<{ projectId: string; overId: string | null } | null>(null);
  const now = useNow(30_000);
  const settingValues = useSettings().values;
  const view = useMemo(() => readViewSettings(settingValues), [settingValues]);

  const forest = useMemo(() => buildForest(treeThreads), [treeThreads]);

  const projectOrder = useMemo(
    () => (projectOrderMode === "fixed" ? resolveProjectOrder(savedProjectOrder, projects) : null),
    [projectOrderMode, savedProjectOrder, projects],
  );
  const canReorder = groupMode === "project" && projectOrder !== null;
  const groups = useMemo(
    () => groupRows(forest, collapsedThreads.values, collapsedGroups.values, groupMode, projectOrder, activeThreadId ?? null),
    [forest, collapsedThreads.values, collapsedGroups.values, groupMode, projectOrder, activeThreadId],
  );
  const showMoreRecent = flags.has("recent-more");
  const recentHidden = !view.showRecent || collapsedGroups.has("recent");
  const recentCollapsed = collapsedGroups.has("recent");
  const recent = useMemo(
    () => recentThreads(threads, showMoreRecent ? view.recentMoreLimit : view.recentLimit),
    [threads, showMoreRecent, view.recentLimit, view.recentMoreLimit],
  );
  const visibleThreads = useMemo(() => {
    const byId = new Map<string, PluginSidebarThread>();
    if (!view.showSubagents) return [];
    if (!recentHidden) for (const thread of recent) byId.set(thread.id, thread);
    for (const group of groups) for (const row of group.rows) byId.set(row.thread.id, row.thread);
    return [...byId.values()];
  }, [groups, recent, recentHidden, view.showSubagents]);
  const subagents = useSubagents(visibleThreads);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const { providers } = useProviders();
  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);

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
  const treePlaceholder =
    groups.length > 0
      ? null
      : !showArchived
        ? "No threads yet."
        : archivedPages?.status === "error"
          ? "Archived threads failed to load."
          : archivedPages?.status === "ready"
            ? "No archived threads."
            : "Loading archived threads…";

  const renderRow = (row: TreeRow<PluginSidebarThread>, variant: "tree" | "recent") => (
    <ThreadRowView
      key={row.thread.id}
      row={row}
      variant={variant}
      context={variant === "recent" ? projectById.get(row.thread.projectId)?.name : undefined}
      isActive={row.thread.id === activeThreadId}
      isCompactViewport={isCompactViewport}
      subagents={subagents.get(row.thread.id)}
      provider={providerById.get(row.thread.providerId)}
      view={view}
      now={now}
      onToggle={() => collapsedThreads.toggle(row.thread.id)}
      onOpen={open}
    />
  );

  return (
    <div className="flex flex-col gap-3 px-1.5 pb-3 pt-1">
      {view.showGithub ? (
        <GithubSection
          isCollapsed={collapsedGroups.has("github")}
          onToggle={() => collapsedGroups.toggle("github")}
          showSnoozed={flags.has("github-snoozed")}
          onToggleSnoozed={() => flags.toggle("github-snoozed")}
        />
      ) : null}

      {view.showAutomations ? (
        <AutomationsSection
          isCollapsed={collapsedGroups.has("automations")}
          onToggle={() => collapsedGroups.toggle("automations")}
          showPaused={flags.has("automations-paused")}
          onTogglePaused={() => flags.toggle("automations-paused")}
          activeThreadId={activeThreadId}
          now={now}
          onNavigate={onNavigate}
        />
      ) : null}

      {view.showRecent ? (
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
                    hasChildren: false,
                    isExpanded: false,
                    hiddenCounts: null,
                  isPeek: false,
                  hasVisibleChildren: false,
                    guides: [],
                  },
                  "recent",
                ),
              )}
              {threads.length > view.recentLimit ? (
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
      ) : null}

      <div className="mx-1.5 border-t border-sidebar-border" />

      <div className="-mb-1 flex h-6 items-center justify-between px-1.5">
        <span className="text-xs font-medium text-sidebar-foreground/45">{showArchived ? "Archived threads" : "Threads"}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-pressed={showArchived}
            title={showArchived ? "Back to active threads" : "Show archived threads"}
            onClick={() => setLifecycle(showArchived ? "active" : "archived")}
            className={cn(
              "flex h-5 items-center gap-1 rounded-md px-1.5 text-2xs outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent",
              showArchived ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/50",
            )}
          >
            <Icon name="Archive" aria-hidden className="size-3" />
            Archived
          </button>
          <GroupByMenu
            mode={groupMode}
            onChange={setGroupMode}
            projectOrderMode={projectOrderMode}
            onProjectOrderChange={setProjectOrderMode}
          />
        </div>
      </div>

      {treePlaceholder ? <div className="px-3 text-xs text-muted-foreground">{treePlaceholder}</div> : null}

      <div role="tree" aria-label={showArchived ? "Archived threads" : "Threads"} className="flex flex-col gap-3">
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
                action={
                  group.projectId
                    ? {
                        label: `New thread in ${title}`,
                        icon: "Plus",
                        onClick: () => {
                          navigate.toCompose({ projectId: group.projectId!, focusPrompt: true });
                          onNavigate();
                        },
                      }
                    : undefined
                }
              />
              {isCollapsed ? null : <div role="group" className="mt-0.5 flex flex-col gap-0.5">{group.rows.map((row) => renderRow(row, "tree"))}</div>}
            </section>
          );
        })}
      </div>

      {archivedPages?.hasNextPage ? (
        <button
          type="button"
          disabled={archivedPages.isFetchingNextPage}
          onClick={() => void archivedPages.fetchNextPage()}
          className="ml-[26px] h-6 self-start rounded-md px-1 text-xs text-sidebar-foreground/45 hover:text-sidebar-foreground disabled:opacity-60"
        >
          {archivedPages.isFetchingNextPage
            ? "Loading…"
            : archivedPages.isFetchNextPageError
              ? "Couldn't load more. Retry"
              : "Show more"}
        </button>
      ) : null}
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
  provider,
  view,
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
  provider: RowProvider | undefined;
  view: ViewSettings;
  now: number;
  onToggle: () => void;
  onOpen: (thread: PluginSidebarThread, event: MouseEvent) => void;
}) {
  const { thread, depth } = row;
  const { splitProps } = useSidebarThreadSplit(thread.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const age = formatAge(thread.updatedAt, now);
  const ageRef = useRef<HTMLSpanElement>(null);
  const [slidePx, setSlidePx] = useState(0);
  useLayoutEffect(() => {
    setSlidePx(Math.max(0, HOVER_ACTIONS_REACH_PX - ROW_END_PAD_PX - (ageRef.current?.offsetWidth ?? 0)));
  }, [age]);
  const target = useMemo(() => toActionTarget(thread), [thread]);
  const isTree = variant === "tree";
  const dot = <StatusDot state={threadDotState(thread)} className="size-2" />;
  const providerName = provider?.displayName ?? thread.providerId;

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
        {isTree ? <TreeGuides depth={depth} guides={row.guides} hasOpenChildren={row.hasVisibleChildren} isPeek={row.isPeek} /> : null}
        {isTree && row.hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            aria-label={row.isExpanded ? "Collapse subthreads" : "Expand subthreads"}
            title={row.isExpanded ? "Collapse subthreads" : "Expand subthreads"}
            className="group/toggle relative flex size-4 shrink-0 items-center justify-center rounded text-sidebar-foreground/60 outline-none hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
          >
            <span className="flex group-hover/row:hidden group-focus-visible/toggle:hidden">{dot}</span>
            <Icon
              name="ChevronRight"
              aria-hidden
              className={cn(
                "hidden size-3.5 transition-transform group-hover/row:block group-focus-visible/toggle:block",
                row.isExpanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="flex size-4 shrink-0 items-center justify-center">{dot}</span>
        )}
        <a
          href={thread.href}
          {...(isTree ? { "data-sidebar-thread-shortcut-target": "", "data-sidebar-thread-id": thread.id } : {})}
          aria-current={isActive ? "page" : undefined}
          aria-label={thread.displayTitle}
          {...splitProps}
          onClick={(event) => onOpen(thread, event)}
          className="flex min-w-0 items-center gap-1.5 self-stretch outline-none"
        >
          <span className={cn("min-w-0 truncate", thread.isUnread && "font-semibold text-sidebar-foreground")}>
            <ThreadTitle threadId={thread.id} />
          </span>
        </a>
        <span aria-hidden className="min-w-0 flex-1" />
        {isTree && row.hiddenCounts ? <FoldSummary counts={row.hiddenCounts} /> : null}
        {/* On hover these slide left, clear of the action buttons, rather than being covered. */}
        <span
          style={{ "--slide": `${slidePx}px` } as React.CSSProperties}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-md transition-transform duration-150 ease-out",
            !isCompactViewport && [SLIDE_ON_HOVER, ROW_HOVER_SOLID_BG_ON_HOVER],
            menuOpen && SLIDE_NOW,
          )}
        >
          {thread.status === "error" && !thread.isArchived ? <RetryButton threadId={thread.id} /> : null}
          {view.showProviderIcon ? (
            <span title={providerName} className="flex shrink-0 text-sidebar-foreground/45">
              <ProviderIcon providerKind="agent" provider={provider ?? { id: thread.providerId }} aria-label={providerName} className="size-3" />
            </span>
          ) : null}
          {view.showSubagents ? <SubagentBadge thread={thread} data={subagents} /> : null}
        </span>
        {view.showAge ? (
          <span
            ref={ageRef}
            className={cn(
              "shrink-0 text-right text-2xs tabular-nums text-sidebar-foreground/45",
              !isCompactViewport && "group-hover/row:invisible",
              menuOpen && "invisible",
            )}
          >
            {age}
          </span>
        ) : null}
        {isCompactViewport ? null : (
          // Hover actions overlay the row's end instead of reserving width, so nothing reflows.
          <span
            className={cn(
              "absolute inset-y-0 right-1 items-center gap-0.5 pl-2",
              isActive ? "bg-sidebar-accent" : ROW_HOVER_SOLID_BG,
              menuOpen ? "flex" : "hidden group-hover/row:flex",
            )}
          >
            <ArchiveButton thread={target} />
            <ThreadActionsMenu
              thread={target}
              onOpenChange={setMenuOpen}
              align="start"
              trigger={(props) => (
                <button
                  type="button"
                  aria-label="Thread actions"
                  {...props}
                  className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <Icon name="MoreHorizontal" fallback="Ellipsis" aria-hidden className="size-3.5" />
                </button>
              )}
            />
          </span>
        )}
      </div>
    </ThreadActionsContextMenu>
  );
}

/** bb's own Archive, so its confirmation for threads with children and its Undo still apply. */
function ArchiveButton({ thread }: { thread: PluginThreadActionTarget }) {
  const [entry] = useThreadActions(thread, { keys: [ARCHIVE_ACTION_KEY] });
  if (!entry) return null;
  const { action } = entry;
  return (
    <button
      type="button"
      aria-label={action.label}
      title={action.label}
      onClick={(event) => {
        event.stopPropagation();
        void action.run();
      }}
      className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <Icon name={action.icon ?? "Archive"} fallback="Archive" aria-hidden className="size-3.5" />
    </button>
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

const FOLD_STATES: readonly { state: DotState; label: string }[] = [
  { state: "running", label: "running" },
  { state: "error", label: "failed" },
  { state: "done", label: "done" },
];

/** What a fold hides, by state; threads needing input never hide, so they are not counted. */
function FoldSummary({ counts }: { counts: StateCounts }) {
  const parts = FOLD_STATES.filter(({ state }) => (counts[state] ?? 0) > 0);
  if (parts.length === 0) return null;
  const description = parts.map(({ state, label }) => `${counts[state]} ${label}`).join(" · ");
  return (
    <span title={`Folded: ${description}`} aria-label={`Folded subthreads: ${description}`} className="flex shrink-0 items-center gap-1.5 text-2xs tabular-nums text-sidebar-foreground/50">
      {parts.map(({ state }) => (
        <span key={state} className="flex items-center gap-0.5">
          <StatusDot state={state} className="animate-none" />
          {counts[state]}
        </span>
      ))}
    </span>
  );
}

/** Rows sit this far apart; continuing lines reach across the gap. */
const ROW_GAP_PX = 2;
const GLYPH_CENTER_PX = 8;

/** Connector lines: straight through levels that continue, an elbow at the row's own level. */
function TreeGuides({
  depth,
  guides,
  hasOpenChildren,
  isPeek,
}: {
  depth: number;
  guides: boolean[];
  hasOpenChildren: boolean;
  /** Dashed: the row shows through its parent's fold. */
  isPeek: boolean;
}) {
  const lineX = (level: number) => ROW_PAD_PX + level * INDENT_PX + GLYPH_CENTER_PX;
  const line = "pointer-events-none absolute border-sidebar-foreground/20";
  const ownLine = cn(line, isPeek && "border-dashed");
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
              className={cn(ownLine, "top-0 h-1/2 rounded-bl-md border-b border-l")}
              style={{ left: lineX(level), width: INDENT_PX - GLYPH_CENTER_PX - 2 }}
            />
            {continues ? (
              <span aria-hidden className={cn(ownLine, "top-1/2 border-l")} style={{ left: lineX(level), bottom: -ROW_GAP_PX }} />
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

type RowProvider = ReturnType<typeof useProviders>["providers"][number];

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
