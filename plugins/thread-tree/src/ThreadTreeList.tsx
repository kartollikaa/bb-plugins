import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
  useRpc,
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
import { GroupHeader, type HeaderMenuItem } from "./GroupHeader";
import { AutomationsSection } from "./AutomationsSection";
import { GithubSection } from "./GithubSection";
import { StatusDot } from "./StatusDot";
import type { rpcContract } from "../server";
import {
  moveSection,
  readViewSettings,
  resolveSectionOrder,
  SIDEBAR_SECTIONS,
  type SectionId,
  type SectionKey,
  type ViewSettings,
} from "./settings";
import { formatAge } from "./time";
import {
  buildForest,
  countStates,
  groupRows,
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
import { useDragReorder, useFlipOrder } from "./useReorder";
import { Collapse } from "./Collapse";

const ROW_PAD_PX = 6;
/** One level puts a child's status icon under its parent's title. */
const INDENT_PX = 24;

const ARCHIVE_ACTION_KEY = "bb--core/archive";
const SWAP_TRANSITION = "transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none";

const GROUP_MODES: readonly { id: GroupMode; label: string; chip: string; icon: React.ReactNode }[] = [
  { id: "project", label: "Project", chip: "Group: Project", icon: <Icon name="Folder" aria-hidden className="size-3.5" /> },
  {
    id: "status",
    label: "Status",
    chip: "Group: Status",
    icon: (
      <span className="flex size-3.5 items-center justify-center">
        <StatusDot state="running" className="size-2 animate-none" />
      </span>
    ),
  },
  { id: "none", label: "None", chip: "No grouping", icon: <Icon name="Layers" aria-hidden className="size-3.5" /> },
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
  const [savedSectionOrder, setSavedSectionOrder] = usePersistentList("section-order");
  const now = useNow(30_000);
  const settingValues = useSettings().values;
  const [view, setSection] = useSectionToggles(useMemo(() => readViewSettings(settingValues), [settingValues]));

  const forest = useMemo(() => buildForest(treeThreads), [treeThreads]);

  const projectOrder = useMemo(
    () => (projectOrderMode === "fixed" ? resolveProjectOrder(savedProjectOrder, projects) : null),
    [projectOrderMode, savedProjectOrder, projects],
  );
  const canReorder = groupMode === "project" && projectOrder !== null;
  const projectDrag = useDragReorder(projectOrder ?? [], setSavedProjectOrder);
  const shownProjectOrder = projectOrder && projectDrag.order;
  const groups = useMemo(
    () => groupRows(forest, collapsedThreads.values, collapsedGroups.values, groupMode, shownProjectOrder, activeThreadId ?? null),
    [forest, collapsedThreads.values, collapsedGroups.values, groupMode, shownProjectOrder, activeThreadId],
  );
  const showMoreRecent = flags.has("recent-more");
  const recentHidden = !view.showRecent || collapsedGroups.has("recent");
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
  const overview = useMemo(() => countStates(threads), [threads]);
  const sectionOrder = useMemo(() => resolveSectionOrder(savedSectionOrder), [savedSectionOrder]);
  const sectionDrag = useDragReorder(sectionOrder, setSavedSectionOrder);
  const recentCollapsed = sectionDrag.isDragging || collapsedGroups.has("recent");
  const shownSections = sectionDrag.order.filter((id) => view[SECTION_BY_ID[id].key]);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  useFlipOrder(sectionsRef, shownSections.join());
  useFlipOrder(treeRef, groups.map((group) => group.key).join());
  const moveSectionBy = (id: SectionId, step: -1 | 1) => setSavedSectionOrder(moveSection(sectionOrder, shownSections, id, step));
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
    <Fragment key={row.thread.id}>
      <ThreadRowView
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
      {variant === "tree" && row.foldCounts ? (
        <FoldLine
          depth={row.depth + 1}
          guides={[...row.guides, row.hasVisibleChildren]}
          counts={row.foldCounts}
          total={row.descendantCount}
          onExpand={() => collapsedThreads.toggle(row.thread.id)}
        />
      ) : null}
    </Fragment>
  );

  return (
    <div ref={sectionsRef} className="relative flex flex-col gap-3 px-1.5 pb-3 pt-1" {...sectionDrag.containerProps}>
      <div className="-mb-2 flex h-5 items-center justify-between gap-2 px-1.5">
        <ActivityOverview counts={overview} />
        <SectionsMenu view={view} order={sectionOrder} onChange={setSection} />
      </div>
      {shownSections.map((id, index) => {
        const section = SECTION_BY_ID[id];
        const menu: HeaderMenuItem[] = [
          ...(index > 0 ? [{ label: "Move up", icon: "ArrowUp", onSelect: () => moveSectionBy(id, -1) }] : []),
          ...(index < shownSections.length - 1 ? [{ label: "Move down", icon: "ArrowDown", onSelect: () => moveSectionBy(id, 1) }] : []),
          { label: "Remove from sidebar", icon: "EyeOff", onSelect: () => setSection(section.key, false) },
        ];
        return (
          <div
            key={id}
            data-flip-key={id}
            {...sectionDrag.itemProps(id)}
            className={cn("select-none rounded-md transition-opacity empty:hidden", sectionDrag.draggingId === id && "opacity-40")}
          >
            {id === "github" ? (
              <GithubSection
                isCollapsed={sectionDrag.isDragging || collapsedGroups.has("github")}
                onToggle={() => collapsedGroups.toggle("github")}
                showSnoozed={flags.has("github-snoozed")}
                onToggleSnoozed={() => flags.toggle("github-snoozed")}
                menu={menu}
              />
            ) : id === "automations" ? (
              <AutomationsSection
                isCollapsed={sectionDrag.isDragging || collapsedGroups.has("automations")}
                onToggle={() => collapsedGroups.toggle("automations")}
                showPaused={flags.has("automations-paused")}
                onTogglePaused={() => flags.toggle("automations-paused")}
                menu={menu}
                activeThreadId={activeThreadId}
                now={now}
                onNavigate={onNavigate}
              />
            ) : (
              <section aria-label="Recent activity">
                <GroupHeader
                  title="Recent Activity"
                  icon={<Icon name="Clock" aria-hidden className="size-3.5" />}
                  isCollapsed={recentCollapsed}
                  count={recent.length}
                  onToggle={() => collapsedGroups.toggle("recent")}
                  menu={menu}
                />
                <Collapse open={!recentCollapsed}>
                  <div role="list" className="mt-0.5 flex flex-col gap-0.5">
                    {recent.map((thread) => renderRow(flatRow(thread), "recent"))}
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
                </Collapse>
              </section>
            )}
          </div>
        );
      })}

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

      <div
        ref={treeRef}
        role="tree"
        aria-label={showArchived ? "Archived threads" : "Threads"}
        className="relative flex flex-col gap-3"
        {...(canReorder ? projectDrag.containerProps : {})}
      >
        {groups.map((group) => {
          const isCollapsed = (canReorder && projectDrag.isDragging) || collapsedGroups.has(group.key);
          const project = group.projectId ? projectById.get(group.projectId) : undefined;
          const { title, icon } = groupLook(group.key, project, isCollapsed);
          const projectId = group.projectId;
          const reorderable = canReorder && projectId !== null;
          return (
            <section
              key={group.key}
              data-flip-key={group.key}
              {...(reorderable ? projectDrag.itemProps(projectId) : {})}
              className={cn("rounded-md transition-opacity", reorderable && "select-none", reorderable && projectDrag.draggingId === projectId && "opacity-40")}
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
              <Collapse open={!isCollapsed}>
                <div role="group" className="mt-0.5 flex flex-col gap-0.5">{group.rows.map((row) => renderRow(row, "tree"))}</div>
              </Collapse>
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

const SECTION_BY_ID = Object.fromEntries(SIDEBAR_SECTIONS.map((section) => [section.id, section])) as {
  [Id in SectionId]: Extract<(typeof SIDEBAR_SECTIONS)[number], { id: Id }>;
};

/** A Recent Activity row: flat, outside the tree. */
function flatRow(thread: PluginSidebarThread): TreeRow<PluginSidebarThread> {
  return {
    thread,
    depth: 0,
    descendantCount: 0,
    hasChildren: false,
    isExpanded: false,
    foldCounts: null,
    isPeek: false,
    hasVisibleChildren: false,
    guides: [],
  };
}

const OVERVIEW_STATES: readonly { state: DotState; label: string }[] = [
  { state: "input", label: "need input" },
  { state: "error", label: "failed" },
  { state: "running", label: "running" },
];

/** What needs attention across all active threads, at a glance. */
function ActivityOverview({ counts }: { counts: StateCounts }) {
  const parts = OVERVIEW_STATES.filter(({ state }) => (counts[state] ?? 0) > 0);
  if (parts.length === 0) return <span className="truncate text-2xs text-sidebar-foreground/40">Nothing running</span>;
  return (
    <span role="status" className="flex min-w-0 items-center gap-2.5 overflow-hidden text-2xs tabular-nums text-sidebar-foreground/60">
      {parts.map(({ state, label }) => (
        <span key={state} className="flex shrink-0 items-center gap-1">
          <StatusDot state={state} className="size-1.5" />
          {counts[state]} {label}
        </span>
      ))}
    </span>
  );
}

/** Section visibility lives in the plugin settings; a toggle applies at once and saves in the background. */
function useSectionToggles(saved: ViewSettings): [ViewSettings, (key: SectionKey, shown: boolean) => void] {
  const rpc = useRpc<typeof rpcContract>();
  const [pending, setPending] = useState<Partial<Record<SectionKey, boolean>>>({});
  useEffect(() => {
    setPending((previous) => {
      const left = Object.fromEntries(Object.entries(previous).filter(([key, shown]) => saved[key as SectionKey] !== shown));
      return Object.keys(left).length === Object.keys(previous).length ? previous : left;
    });
  }, [saved]);
  const view = useMemo(() => ({ ...saved, ...pending }), [saved, pending]);
  const setSection = useCallback(
    (key: SectionKey, shown: boolean) => {
      setPending((previous) => ({ ...previous, [key]: shown }));
      rpc.call("setSections", { [key]: shown }).catch((error: unknown) => {
        setPending(({ [key]: _dropped, ...rest }) => rest);
        toast.error("Couldn't save the sidebar sections", { description: error instanceof Error ? error.message : String(error) });
      });
    },
    [rpc],
  );
  return [view, setSection];
}

function SectionsMenu({
  view,
  order,
  onChange,
}: {
  view: ViewSettings;
  order: readonly SectionId[];
  onChange: (key: SectionKey, shown: boolean) => void;
}) {
  const portalProps = usePortalScopeProps();
  const hidden = SIDEBAR_SECTIONS.filter(({ key }) => !view[key]).length;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="Choose the sections shown in the sidebar"
          className="flex h-5 items-center gap-1 rounded-md px-1.5 text-2xs text-sidebar-foreground/50 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
        >
          <Icon name="LayoutList" fallback="Layers" aria-hidden className="size-3" />
          Sections
          {hidden > 0 ? <span className="tabular-nums text-sidebar-foreground/40">· {hidden} hidden</span> : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...portalProps}
          align="end"
          sideOffset={4}
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.Label className="px-2 py-1 text-xs text-muted-foreground">Show in sidebar</DropdownMenu.Label>
          {order.map((id) => SECTION_BY_ID[id]).map(({ key, label, icon }) => (
            <DropdownMenu.CheckboxItem
              key={key}
              checked={view[key]}
              onCheckedChange={(checked) => onChange(key, checked === true)}
              onSelect={(event) => event.preventDefault()}
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
            >
              <Icon name={icon} aria-hidden className="size-3.5 text-muted-foreground" />
              <span className="flex-1">{label}</span>
              <DropdownMenu.ItemIndicator>
                <Icon name="Check" aria-hidden className="size-3.5" />
              </DropdownMenu.ItemIndicator>
            </DropdownMenu.CheckboxItem>
          ))}
          <div className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">Drag a header to move it.</div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
          aria-label={`Change grouping, now ${current.chip}`}
          title="Change how threads are grouped"
          className="flex h-5 items-center gap-1 rounded-md px-1.5 text-2xs text-sidebar-foreground/50 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
        >
          <Icon name="SlidersHorizontal" aria-hidden className="size-3" />
          {current.chip}
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
        {isTree ? <TreeGuides depth={depth} guides={row.guides} hasOpenChildren={row.hasVisibleChildren || row.foldCounts !== null} isPeek={row.isPeek} /> : null}
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
        {thread.status === "error" && !thread.isArchived ? <RetryButton threadId={thread.id} /> : null}
        {view.showProviderIcon ? (
          <span title={providerName} className="flex shrink-0 text-sidebar-foreground/45">
            <ProviderIcon providerKind="agent" provider={provider ?? { id: thread.providerId }} aria-label={providerName} className="size-3" />
          </span>
        ) : null}
        {view.showSubagents ? <SubagentBadge thread={thread} data={subagents} /> : null}
        {/* Age shrinks away as the actions grow in, so the row's icons glide left and the title truncates. */}
        <span className="-mr-1 flex shrink-0 items-center">
          {view.showAge ? (
            <span
              className={cn(
                "overflow-hidden whitespace-nowrap pr-1 text-right text-2xs tabular-nums text-sidebar-foreground/45",
                !isCompactViewport && [SWAP_TRANSITION, "max-w-10 group-hover/row:max-w-0 group-hover/row:opacity-0 group-has-[:focus-visible]/row:max-w-0 group-has-[:focus-visible]/row:opacity-0"],
                menuOpen && "max-w-0 opacity-0",
              )}
            >
              {age}
            </span>
          ) : null}
          {isCompactViewport ? null : (
            <span
              className={cn(
                "flex items-center gap-0.5 overflow-hidden",
                SWAP_TRANSITION,
                menuOpen
                  ? "max-w-12 opacity-100"
                  : "max-w-0 opacity-0 group-hover/row:max-w-12 group-hover/row:opacity-100 group-has-[:focus-visible]/row:max-w-12 group-has-[:focus-visible]/row:opacity-100",
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
        </span>
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
  { state: "input", label: "needs input" },
  { state: "error", label: "failed" },
  { state: "running", label: "running" },
  { state: "done", label: "done" },
];

/** The line under a folded parent: its whole subtree by state. Clicking it unfolds. */
function FoldLine({
  depth,
  guides,
  counts,
  total,
  onExpand,
}: {
  depth: number;
  guides: boolean[];
  counts: StateCounts;
  total: number;
  onExpand: () => void;
}) {
  const parts = FOLD_STATES.filter(({ state }) => (counts[state] ?? 0) > 0);
  const subthreads = `${total} subthread${total === 1 ? "" : "s"}`;
  const description = [subthreads, ...parts.map(({ state, label }) => `${counts[state]} ${label}`)].join(", ");
  return (
    <div role="none" className="relative flex h-6 items-center pr-2" style={{ paddingLeft: ROW_PAD_PX + depth * INDENT_PX }}>
      <TreeGuides depth={depth} guides={guides} hasOpenChildren={false} isPeek />
      <button
        type="button"
        onClick={onExpand}
        title={`Expand: ${description}`}
        aria-label={`Expand subthreads: ${description}`}
        className="-ml-1 flex h-5 min-w-0 items-center gap-2 overflow-hidden rounded-md px-1 text-2xs tabular-nums text-sidebar-foreground/50 outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
      >
        <span className="shrink-0">{subthreads}</span>
        {parts.map(({ state, label }) => (
          <span key={state} className="flex shrink-0 items-center gap-1">
            <StatusDot state={state} className="animate-none" />
            {counts[state]} {label}
          </span>
        ))}
      </button>
    </div>
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
