import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { toast } from "sonner";
import {
  ThreadTitle,
  experimental_ShortcutHint as ShortcutHint,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_ThreadActionsMenu as ThreadActionsMenu,
  experimental_THREAD_ACTION_GROUPS as THREAD_ACTION_GROUPS,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders as useProviders,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useThreadActions as useThreadActions,
  useBbNavigate,
  useRpc,
  useSdk,
  useSettings,
  useSidebarThreadDraft,
  useSidebarThreadRowStatus,
  useSidebarThreadShortcut,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginSidebarThreadShortcut,
  type PluginThreadActionTarget,
  type PluginThreadActionsInlineItem,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { useTapToOpenMenu } from "./useTapToOpenMenu";
import { useThreadPullRequests } from "./useThreadPullRequests";
import { excludeDescendantPullRequests, type ThreadPullRequest } from "./threadPullRequests";
import { folderAttentionByUrl, PR_REASON_LOOK, prTooltip, rowPullRequest, type FolderAttention, type RowPullRequest } from "./prAttention";
import { providerTintColor } from "./providerTint";
import { familyRootOf, sharedBranchThreads, sharedBranchTooltip } from "./sharedBranch";
import { pullRequestThreads } from "./pullRequestKeys";
import { SubagentBadge } from "./SubagentBadge";
import { GroupHeader, type HeaderMenuItem } from "./GroupHeader";
import { AutomationsSection, useAutomations } from "./AutomationsSection";
import { NeedsYouSection, useNeedsYou } from "./NeedsYouSection";
import { pullRequestSourcesSettled } from "./needsYou";
import { GithubSection, useGithubFolder } from "./GithubSection";
import { isSectionCollapsed, sectionToggleKey } from "./sectionSummaries";
import { RollupGlyph, RowStatusGlyph } from "./ThreadGlyph";
import { resolveRowGlyph, rollupGlyph } from "./statusGlyph";
import { StatusLine } from "./StatusLine";
import { DOT_CLASS } from "./StatusDot";
import { countStatusFilters, filterThreads, handleFlatListEscape, handleSearchKey, isModalDialog, MODAL_DIALOG_SELECTOR, orchestrationTitle, refocusAfterClose, returnFocus, runningContext, type CloseReason, sidebarBehindModal, searchThreads, STATUS_FILTERS, type ClosedView, type StatusFilter } from "./statusFilters";
import type { rpcContract } from "../server";
import {
  moveSection,
  readViewSettings,
  resolveSectionOrder,
  shownSectionIds,
  SIDEBAR_SECTIONS,
  type SectionId,
  type SectionKey,
  type ViewSettings,
} from "./settings";
import { formatAge } from "./time";
import {
  buildForest,
  descendantsOf,
  type Forest,
  groupRows,
  recentThreads,
  threadsOnScreen,
  readFolderSorts,
  rememberProjectFolders,
  type ThreadSort,
  resolveProjectOrder,
  type ThreadState,
  type GroupMode,
  type FoldCounts,
  type FoldState,
  type RollupState,
  foldState,
  type TreeRow,
} from "./tree";
import { foldArchivePlan, foldBarSegments, type FoldArchivePlan, isFinishedFold, orchestrations, orchestrationSubtitle, rollupOver, MAX_THREADS_PER_CALL } from "./orchestrations";
import { archiveInTurn, dialogOutsideSidebar, foldArchiveOutcome, skippedSummary, waitForArchive, type ArchiveRunResult } from "./archiveRun";
import { ARCHIVE_CONFIRM_WAIT_MS } from "./archiveUndo";
import { useSubagents, type ThreadSubagents } from "./useSubagents";
import { usePersistentChoice, usePersistentList, usePersistentRecord, usePersistentSet } from "./usePersistentSet";
import { useDragReorder, useFlipOrder } from "./useReorder";
import { ReduceMotionContext, useStill } from "./motion";
import { Collapse } from "./Collapse";
import { ROW_FADE_ACTIVE, ROW_FADE_GRADIENT, ROW_FADE_HOVER, ROW_FADE_SOLID, ROW_TINT, TOUCH_DIMMED } from "./rowStyles";
import { canStop, END_SLOT_MIN_PX, NO_HOVER_QUERY, ROW_ACTION_BUTTON, hoverActionsClass, ROW_END_PAD_PX, rowHeightPx, STRIP_END_PAD_PX, STRIP_GAP_PX, stopsFromGlyph } from "./rowActions";
import { useArchiveUndo } from "./useArchiveUndo";
import { RetryButton } from "./RetryButton";

const ROW_PAD_PX = 6;
/** One level puts a child's status icon under its parent's title. */
const INDENT_PX = 24;

const ARCHIVE_ACTION_KEY = "bb--core/archive";

const GROUP_MODES: readonly { id: GroupMode; label: string; chip: string; icon: React.ReactNode }[] = [
  { id: "project", label: "Project", chip: "Group: Project", icon: <Icon name="Folder" aria-hidden className="size-3.5" /> },
  {
    id: "status",
    label: "Status",
    chip: "Group: Status",
    icon: <RollupGlyph state="running" />,
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
  waiting: "Waiting",
  done: "Done",
};

export function ThreadTreeList({ activeThreadId, isCompactViewport, onNavigate }: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const navigate = useBbNavigate();
  const collapsedThreads = usePersistentSet("collapsed-threads");
  const collapsedGroups = usePersistentSet("collapsed-groups");
  const flags = usePersistentSet("flags");
  const [threadSort, setThreadSort] = usePersistentChoice<ThreadSort>("thread-sort", ["activity", "status", "created"], "activity");
  const [folderSorts, setFolderSort] = usePersistentRecord("folder-thread-sorts", readFolderSorts);
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
  const rpc = useRpc<typeof rpcContract>();
  const [serverProjectFolders, setServerProjectFolders] = useState<readonly string[]>([]);
  const projectPresence = [...new Set(threads.map((thread) => thread.projectId))].sort().join();
  useEffect(() => {
    let cancelled = false;
    void rpc.call("projectFolders", null).then(({ projectIds }) => {
      if (!cancelled) setServerProjectFolders(projectIds);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [rpc, projectPresence, projects]);
  const [savedProjectFolders, setSavedProjectFolders] = usePersistentList("used-project-folders");
  const retainedProjectIds = useMemo(
    () => rememberProjectFolders([...savedProjectFolders, ...serverProjectFolders], projects, [...threads, ...listed.threads]),
    [savedProjectFolders, serverProjectFolders, projects, threads, listed.threads],
  );
  useEffect(() => {
    if (status !== "ready") return;
    if (retainedProjectIds.length !== savedProjectFolders.length || retainedProjectIds.some((id, index) => id !== savedProjectFolders[index])) {
      setSavedProjectFolders(retainedProjectIds);
    }
  }, [status, retainedProjectIds, savedProjectFolders, setSavedProjectFolders]);
  const [savedSectionOrder, setSavedSectionOrder] = usePersistentList("section-order");
  const now = useNow(30_000);
  const settingValues = useSettings().values;
  const [view, setSection] = useSectionToggles(useMemo(() => readViewSettings(settingValues), [settingValues]));

  const activeThreadIds = useMemo(() => threads.map((thread) => thread.id), [threads]);
  useArchiveUndo(activeThreadIds, status === "ready");
  const activeForest = useMemo(() => buildForest(threads), [threads]);
  const forest = useMemo(() => showArchived ? buildForest(listed.threads) : activeForest, [showArchived, listed.threads, activeForest]);

  const projectOrder = useMemo(
    () => (projectOrderMode === "fixed" ? resolveProjectOrder(savedProjectOrder, projects) : null),
    [projectOrderMode, savedProjectOrder, projects],
  );
  const canReorder = groupMode === "project" && projectOrder !== null;
  const projectDrag = useDragReorder(projectOrder ?? [], setSavedProjectOrder);
  const shownProjectOrder = projectOrder && projectDrag.order;
  const groups = useMemo(
    () => groupRows(forest, collapsedThreads.values, groupMode, shownProjectOrder, activeThreadId ?? null, folderSorts, threadSort, showArchived ? [] : retainedProjectIds),
    [forest, collapsedThreads.values, groupMode, shownProjectOrder, activeThreadId, folderSorts, threadSort, showArchived, retainedProjectIds],
  );
  const showMoreRecent = flags.has("recent-more");
  const recentHidden = !view.showRecent || collapsedGroups.has("recent");
  const recent = useMemo(
    () => recentThreads(threads, showMoreRecent ? view.recentMoreLimit : view.recentLimit),
    [threads, showMoreRecent, view.recentLimit, view.recentMoreLimit],
  );
  const filterCounts = useMemo(() => countStatusFilters(threads), [threads]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sectionOrder = useMemo(() => resolveSectionOrder(savedSectionOrder), [savedSectionOrder]);
  const sectionDrag = useDragReorder(sectionOrder, setSavedSectionOrder);
  const foldSections = view.foldOnDrag && sectionDrag.isDragging;
  const recentCollapsed = foldSections || collapsedGroups.has("recent");
  const githubFolder = useGithubFolder();
  const presentSections = useMemo(
    () => SIDEBAR_SECTIONS.map((section) => section.id).filter((id) => id !== "github" || githubFolder.view !== null),
    [githubFolder.view],
  );
  const shownSections = shownSectionIds(sectionDrag.order, view, presentSections);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  useFlipOrder(sectionsRef, shownSections.join(), view.reduceMotion);
  useFlipOrder(treeRef, groups.map((group) => group.key).join(), view.reduceMotion);
  const moveSectionBy = (id: SectionId, step: -1 | 1) => setSavedSectionOrder(moveSection(sectionOrder, shownSections, id, step));
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const prThreads = useMemo(() => pullRequestThreads(activeForest, forest), [activeForest, forest]);
  const { pullRequestsOf, isLoading: pullRequestsLoading } = useThreadPullRequests(prThreads, sectionsRef);
  const folderItems = githubFolder.view;
  const folderAttention = useMemo(
    () => folderAttentionByUrl(folderItems ? [...folderItems.items, ...folderItems.snoozed] : []),
    [folderItems],
  );
  const orchestrationOf = useMemo(() => orchestrationTitle(threads), [threads]);
  const automations = useAutomations();
  const descendantIdsOf = useCallback((threadId: string) => descendantsOf(activeForest, threadId).map((thread) => thread.id), [activeForest]);
  const needsYou = useNeedsYou({
    threads,
    descendantIdsOf,
    pullRequestsOf,
    folderAttention,
    folderItems: useMemo(() => folderItems?.items ?? [], [folderItems]),
    automations: useMemo(() => automations.state?.automations ?? [], [automations.state]),
    pullRequestMode: view.needsYouPullRequests,
    pullRequestsSettled: pullRequestSourcesSettled({ threadsStatus: status, folderLoaded: githubFolder.isLoaded, pullRequestsLoading }),
    orchestrationOf,
    activeThreadId: activeThreadId ?? null,
    onNavigate,
  });
  const sharedBranches = useMemo(() => sharedBranchThreads(threads, familyRootOf(threads)), [threads]);
  const orchestrationList = useMemo(() => orchestrations(activeForest), [activeForest]);
  const canHover = !useMediaQuery(NO_HOVER_QUERY);
  const searchPool = showArchived ? listed.threads : threads;
  const flatList = useMemo(() => {
    if (statusFilter) return filterThreads(threads, statusFilter);
    if (!searchOpen || query.trim() === "") return null;
    return searchThreads(searchPool, query, (thread) => ({
      projectName: projectById.get(thread.projectId)?.name ?? null,
      pullRequestNumbers: pullRequestsOf(thread).map((pr) => pr.number),
    }));
  }, [statusFilter, threads, searchOpen, query, searchPool, projectById, pullRequestsOf]);
  const shownThreads = useMemo(
    () => (view.showSubagents ? threadsOnScreen({ flatList, recent, recentHidden, groups, collapsed: collapsedGroups.values }) : []),
    [flatList, recent, recentHidden, groups, view.showSubagents, collapsedGroups.values],
  );
  const subagents = useSubagents(shownThreads);
  const openSearch = useCallback(() => {
    setStatusFilter(null);
    setSearchOpen(true);
    searchInputRef.current?.focus();
  }, []);
  const pendingFocus = useRef<ClosedView | null>(null);
  const closeSearch = useCallback((reason: CloseReason = "action") => {
    pendingFocus.current = refocusAfterClose({ search: true }, reason);
    setSearchOpen(false);
    setQuery("");
  }, []);
  const closeFlatList = useCallback(() => {
    if (statusFilter) {
      setStatusFilter(null);
      pendingFocus.current = { filter: statusFilter };
    } else closeSearch();
  }, [statusFilter, closeSearch]);
  useEffect(() => {
    const closed = pendingFocus.current;
    pendingFocus.current = null;
    if (closed && sectionsRef.current) returnFocus(document, sectionsRef.current, closed);
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const sidebar = sectionsRef.current;
      handleSearchKey(event, {
        modalOpen: () => (!!sidebar && sidebarBehindModal(sidebar)) || Array.from(document.querySelectorAll(MODAL_DIALOG_SELECTOR)).some((dialog) => isModalDialog(dialog) && (!sidebar || !dialog.contains(sidebar))),
        sidebarShown: () => (sidebar?.getClientRects().length ?? 0) > 0,
        open: openSearch,
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);
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

  const [archiveJob, setArchiveJob] = useState<BbArchiveJob | null>(null);
  const archiveJobRunning = useRef(false);
  const runBbArchive = useCallback((targets: PluginThreadActionTarget[], isStillClean: (id: string) => Promise<boolean>) => {
    if (archiveJobRunning.current) return Promise.resolve<ArchiveRunResult>({ archived: [], changed: [], stop: "busy" });
    archiveJobRunning.current = true;
    return new Promise<ArchiveRunResult>((resolve) => setArchiveJob({
      targets,
      isStillClean,
      finish: (result) => {
        archiveJobRunning.current = false;
        setArchiveJob(null);
        resolve(result);
      },
    }));
  }, []);
  const archiveFold = useCallback((root: PluginSidebarThread) => prepareFoldArchive(rpc, activeForest, root, runBbArchive), [rpc, activeForest, runBbArchive]);

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

  const renderRow = (
    row: TreeRow<PluginSidebarThread>,
    variant: "tree" | "flat",
    { subtitle, numbered = variant === "tree", rollup }: { subtitle?: string; numbered?: boolean; rollup?: RollupState | null } = {},
  ) => (
    <Fragment key={row.thread.id}>
      <ThreadRowView
        row={row}
        forest={variant === "flat" ? activeForest : forest}
        variant={variant}
        numbered={numbered}
        context={variant === "flat" ? projectById.get(row.thread.projectId)?.name : undefined}
        subtitle={subtitle}
        isActive={row.thread.id === activeThreadId}
        rollup={rollup}
        isCompactViewport={isCompactViewport}
        canHover={canHover}
        subagents={subagents.get(row.thread.id)}
        provider={providerById.get(row.thread.providerId)}
        pullRequestsOf={pullRequestsOf}
        folderAttention={folderAttention}
        sharesBranchWith={sharedBranches.get(row.thread.id)}
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
          own={foldState(row.thread)}
          total={row.descendantCount}
          onExpand={() => collapsedThreads.toggle(row.thread.id)}
          onArchive={showArchived ? undefined : () => archiveFold(row.thread)}
        />
      ) : null}
    </Fragment>
  );

  return (
    <ReduceMotionContext.Provider value={view.reduceMotion}>
      <div
        ref={sectionsRef}
        className="relative flex flex-col gap-3 px-1.5 pb-3 pt-1"
        {...sectionDrag.containerProps}
        onKeyDown={(event) => {
          if (event.currentTarget.contains(event.target as Node)) handleFlatListEscape(event, !!(statusFilter || searchOpen), closeFlatList);
        }}
      >
      <div className="-mb-2 flex h-5 items-center justify-between gap-2 px-1.5">
        <StatusLine
          counts={filterCounts}
          filter={statusFilter}
          onFilter={setStatusFilter}
          searchOpen={searchOpen}
          query={query}
          onQuery={setQuery}
          onOpenSearch={openSearch}
          onCloseSearch={closeSearch}
          inputRef={searchInputRef}
        />
        <SectionsMenu view={view} order={sectionOrder.filter((id) => presentSections.includes(id))} onChange={setSection} />
      </div>
      {flatList ? (
        <FlatListSection
          heading={statusFilter ? STATUS_FILTERS.find((entry) => entry.id === statusFilter)!.heading : `Matching “${query.trim()}”`}
          count={flatList.length}
          emptyText={statusFilter ? "Nothing here." : "No threads match."}
          onClear={closeFlatList}
        >
          {flatList.map((thread) => renderRow(flatRow(thread), "flat", {
            numbered: true,
            subtitle: statusFilter === "running" ? runningContext(projectById.get(thread.projectId)?.name ?? null, orchestrationOf(thread.id)) : undefined,
          }))}
        </FlatListSection>
      ) : (
      <>
      <NeedsYouSection
        items={needsYou.items}
        isCollapsed={foldSections || collapsedGroups.has("needs-you")}
        onToggle={() => collapsedGroups.toggle("needs-you")}
        activeThreadId={activeThreadId ?? null}
        isCompactViewport={isCompactViewport}
        canHover={canHover}
        reduceMotion={view.reduceMotion}
        now={now}
        onOpen={needsYou.open}
        onSnooze={needsYou.snooze}
      />
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
                folder={githubFolder}
                threadOfPullRequest={needsYou.threadOfPullRequest}
                onOpenThread={(threadId) => {
                  navigate.toThread(threadId);
                  onNavigate();
                }}
                isCollapsed={foldSections || isSectionCollapsed(collapsedGroups.values, "github")}
                onToggle={() => collapsedGroups.toggle(sectionToggleKey("github"))}
                showSnoozed={flags.has("github-snoozed")}
                onToggleSnoozed={() => flags.toggle("github-snoozed")}
                menu={menu}
              />
            ) : id === "automations" ? (
              <AutomationsSection
                automations={automations}
                isCollapsed={foldSections || isSectionCollapsed(collapsedGroups.values, "automations")}
                onToggle={() => collapsedGroups.toggle(sectionToggleKey("automations"))}
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
  alwaysShowCount
                  onToggle={() => collapsedGroups.toggle("recent")}
                  menu={menu}
                />
                <Collapse open={!recentCollapsed}>
                  <div role="list" className="mt-0.5 flex flex-col gap-0.5">
                    {recent.map((thread) => renderRow(flatRow(thread), "flat"))}
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
          <ThreadSortMenu value={threadSort} onChange={setThreadSort} />
          <GroupByMenu
            mode={groupMode}
            onChange={setGroupMode}
            projectOrderMode={projectOrderMode}
            onProjectOrderChange={setProjectOrderMode}
          />
        </div>
      </div>

      {!showArchived && orchestrationList.length > 0 ? (
        <section aria-label="Orchestrations" data-orchestrations="">
          <GroupHeader
            title="Orchestrations"
            icon={<Icon name="Network" fallback="Layers" aria-hidden className="size-3.5" />}
            isCollapsed={collapsedGroups.has("orchestrations")}
            count={orchestrationList.length}
            alwaysShowCount
            onToggle={() => collapsedGroups.toggle("orchestrations")}
          />
          <Collapse open={!collapsedGroups.has("orchestrations")}>
            <div role="list" className="mt-0.5 flex flex-col gap-0.5">
              {orchestrationList.map((entry) => renderRow(flatRow(entry.thread), "flat", {
                numbered: false,
                subtitle: orchestrationSubtitle(entry, (projectId) => projectById.get(projectId)?.name ?? null),
                rollup: entry.rollup,
              }))}
            </div>
          </Collapse>
        </section>
      ) : null}

      {treePlaceholder ? <div className="px-3 text-xs text-muted-foreground">{treePlaceholder}</div> : null}

      <div
        ref={treeRef}
        role="tree"
        aria-label={showArchived ? "Archived threads" : "Threads"}
        className="relative flex flex-col gap-3"
        {...(canReorder ? projectDrag.containerProps : {})}
      >
        {groups.map((group) => {
          const isCollapsed = (view.foldOnDrag && canReorder && projectDrag.isDragging) || collapsedGroups.has(group.key);
          const project = group.projectId ? projectById.get(group.projectId) : undefined;
          const { title, icon } = groupLook(group.key, project, isCollapsed);
          const projectId = group.projectId;
          const startThread = projectId ? () => {
            navigate.toCompose({ projectId, focusPrompt: true });
            onNavigate();
          } : undefined;
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
                extra={group.key !== "pinned" ? (
                  <ThreadSortMenu
                    title={title}
                    value={folderSorts[group.key] ?? "inherit"}
                    defaultSort={threadSort}
                    onChange={(sort) => setFolderSort(group.key, sort === "inherit" ? undefined : sort)}
                  />
                ) : undefined}
                count={group.rootCount}
                alwaysShowCount={group.rootCount === 0}
                onToggle={() => collapsedGroups.toggle(group.key)}
                action={
                  startThread
                    ? {
                        label: `New thread in ${title}`,
                        icon: "Plus",
                        alwaysVisible: true,
                        onClick: startThread,
                      }
                    : undefined
                }
              />
              <Collapse open={!isCollapsed}>
                <div role="group" className="mt-0.5 flex flex-col gap-0.5">
                  {group.rows.map((row) => renderRow(row, "tree"))}
                  {group.rows.length === 0 && startThread ? (
                    <button
                      type="button"
                      onClick={startThread}
                      className="ml-[26px] flex h-8 items-center rounded-md px-2 text-left text-xs text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
                    >
                      Start a new thread
                    </button>
                  ) : null}
                </div>
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
      </>
      )}
      </div>
      {archiveJob ? <BbArchiveRun job={archiveJob} sidebarRef={sectionsRef} /> : null}
    </ReduceMotionContext.Provider>
  );
}

const FOLDER_BACK = "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z";
const FOLDER_FLAP = "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z";
const FOLDER_PAPER = "M6.5 11.5V9.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v2";

/**
 * Opening tips the back panel away, lets the front flap fall forward on its bottom hinge and raises a sheet from inside.
 * The mask keeps every line single: the icon colour is translucent, so overlapping strokes would show doubled.
 */
function FolderIcon({ isOpen }: { isOpen: boolean }) {
  const still = useStill();
  const maskId = `folder-flap-${useId()}`;
  const motion = cn(
    "[transform-box:view-box]",
    !still && "transition-[transform,fill-opacity] duration-200 ease-[cubic-bezier(0.3,1.35,0.6,1)] motion-reduce:transition-none",
  );
  const flap = cn(motion, "origin-[2px_20px]", isOpen && "[transform:skewX(-20deg)_scaleY(0.62)]");
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0 overflow-visible"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36">
        <rect x="-6" y="-6" width="36" height="36" fill="white" stroke="none" />
        <path d={FOLDER_FLAP} fill="black" stroke="black" className={flap} />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path d={FOLDER_BACK} fillOpacity={0} className={cn(motion, "origin-[2px_20px]", isOpen && "[transform:skewX(4deg)]")} />
        <path d={FOLDER_PAPER} fillOpacity={0} className={cn(motion, !isOpen && "[transform:translateY(4px)]")} />
      </g>
      <path d={FOLDER_FLAP} className={cn(flap, isOpen ? "[fill-opacity:0.3]" : "[fill-opacity:0.14]")} />
    </svg>
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
    const state = key.slice("status:".length) as ThreadState;
    return {
      title: STATUS_GROUP_TITLE[state] ?? state,
      icon: <RollupGlyph state={state} />,
    };
  }
  return {
    title: project?.name ?? "Unknown project",
    icon: <FolderIcon isOpen={!isCollapsed} />,
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

/** A status filter's or a search's matches, flat, in place of the sections and the tree. */
function FlatListSection({
  heading,
  count,
  emptyText,
  onClear,
  children,
}: {
  heading: string;
  count: number;
  emptyText: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={heading} data-flat-list="">
      <div className="flex h-7 items-center gap-2 px-1.5 text-xs font-medium text-sidebar-foreground/60">
        <span className="min-w-0 truncate">{heading}</span>
        <span className="tabular-nums text-sidebar-foreground/40">{count}</span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto flex h-5 shrink-0 items-center rounded-md px-1.5 text-2xs font-normal text-sidebar-foreground/50 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring"
        >
          Clear
        </button>
      </div>
      <div role="list" className="mt-0.5 flex flex-col gap-0.5">
        {children}
        {count === 0 ? <div className="px-3 py-1 text-xs text-muted-foreground">{emptyText}</div> : null}
      </div>
    </section>
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
  const menu = useTapToOpenMenu();
  const hidden = order.filter((id) => !view[SECTION_BY_ID[id].key]).length;
  return (
    <DropdownMenu.Root {...menu.rootProps}>
      <DropdownMenu.Trigger asChild {...menu.triggerProps}>
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
  const menu = useTapToOpenMenu();
  const current = GROUP_MODES.find((entry) => entry.id === mode) ?? GROUP_MODES[0]!;
  return (
    <DropdownMenu.Root {...menu.rootProps}>
      <DropdownMenu.Trigger asChild {...menu.triggerProps}>
        <button
          type="button"
          aria-label={`Change grouping, now ${current.chip}`}
          title={`Group threads: ${current.label}`}
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
        >
          <Icon name="Layers" aria-hidden className="size-3" />
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
              onSelect={(event) => { event.preventDefault(); onChange(entry.id); }}
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
                  onSelect={(event) => { event.preventDefault(); onProjectOrderChange(entry.id); }}
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
  forest,
  variant,
  numbered,
  context,
  subtitle,
  isActive,
  rollup,
  isCompactViewport,
  canHover,
  subagents,
  provider,
  pullRequestsOf,
  folderAttention,
  sharesBranchWith,
  view,
  now,
  onToggle,
  onOpen,
}: {
  row: TreeRow<PluginSidebarThread>;
  forest: Forest<PluginSidebarThread>;
  variant: "tree" | "flat";
  /** bb's jump keys target these rows: the tree's, or the filter or search list that replaces it; never Recent Activity's duplicates. */
  numbered: boolean;
  context?: string;
  /** A second line under the title: the Running filter's context or an orchestration's progress. */
  subtitle?: string;
  isActive: boolean;
  /** The subtree's state drawn in place of the thread's own; a folded tree row works it out itself. */
  rollup?: RollupState | null;
  isCompactViewport: boolean;
  canHover: boolean;
  subagents: ThreadSubagents | undefined;
  provider: RowProvider | undefined;
  pullRequestsOf: (thread: PluginSidebarThread) => ThreadPullRequest[];
  folderAttention: FolderAttention;
  sharesBranchWith: readonly PluginSidebarThread[] | undefined;
  view: ViewSettings;
  now: number;
  onToggle: () => void;
  onOpen: (thread: PluginSidebarThread, event: MouseEvent) => void;
}) {
  const { thread, depth } = row;
  const descendants = useMemo(() => descendantsOf(forest, thread.id), [forest, thread.id]);
  const { splitProps } = useSidebarThreadSplit(thread.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const age = formatAge(thread.updatedAt, now);
  const target = useMemo(() => toActionTarget(thread), [thread]);
  const isTree = variant === "tree";
  const Link = numbered ? NumberedRowLink : RowLink;
  const { hasUnsubmittedDraft } = useSidebarThreadDraft(thread.id);
  const rowStatus = useSidebarThreadRowStatus(thread.id);
  const rolledUp = rollup !== undefined ? rollup : row.foldCounts ? rollupOver(foldState(thread), row.foldCounts) : null;
  const ownGlyph = resolveRowGlyph(thread, hasUnsubmittedDraft, rowStatus);
  const glyph = rolledUp ? rollupGlyph(rolledUp, ownGlyph.label) : ownGlyph;
  const dot = <RowStatusGlyph glyph={glyph} />;
  const providerName = provider?.displayName ?? thread.providerId;
  const failed = thread.status === "error" && !thread.isArchived;
  const pullRequest = rowPullRequest(excludeDescendantPullRequests(pullRequestsOf(thread), descendants.flatMap(pullRequestsOf)), folderAttention, failed);
  const branch = thread.environment?.branchName ?? null;
  const tooltip = [
    context ? `${thread.displayTitle} · ${context}` : thread.displayTitle,
    branch ? `Branch: ${branch}` : null,
    `Provider: ${providerName}`,
    `Updated ${age === "now" ? "just now" : `${age} ago`}`,
  ].filter(Boolean).join("\n");

  const heightPx = rowHeightPx(isCompactViewport, subtitle ? 2 : 1);
  const stopInline = useStopInlineAction(thread);

  return (
    <ThreadActionsContextMenu thread={target} inline={stopInline}>
      <div
        role={isTree ? "treeitem" : "listitem"}
        aria-level={isTree ? depth + 1 : undefined}
        aria-expanded={isTree && row.hasChildren ? row.isExpanded : undefined}
        aria-selected={isTree ? isActive : undefined}
        title={tooltip}
        data-thread-row=""
        data-thread-id={thread.id}
        data-rollup={rolledUp ?? undefined}
        className={cn(
          "group/row relative rounded-md text-sm text-sidebar-foreground/90",
          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ROW_TINT,
        )}
        data-keyboard-focus={keyboardFocus || undefined}
        data-menu-open={menuOpen || undefined}
        style={{ paddingLeft: ROW_PAD_PX + depth * INDENT_PX, paddingRight: ROW_END_PAD_PX, height: heightPx }}
        onFocus={(event) => {
          if (event.currentTarget.contains(event.target)) setKeyboardFocus(event.target.matches(":focus-visible"));
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocus(false);
        }}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          // Portalled menus bubble through React; only clicks on the row itself open it.
          if (!event.currentTarget.contains(target) || target.closest("a, button")) return;
          onOpen(thread, event);
        }}
      >
        {isTree ? <TreeGuides depth={depth} guides={row.guides} hasOpenChildren={row.hasVisibleChildren || row.foldCounts !== null} isPeek={row.isPeek} centerY={heightPx / 2} /> : null}
        <div className="relative flex h-full min-w-0 items-center gap-2">
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
          ) : stopsFromGlyph(thread, { glyph, hasChildren: row.hasChildren, isCompactViewport, canHover }) ? (
            <StopGlyphButton threadId={thread.id} stateLabel={glyph.label}>{dot}</StopGlyphButton>
          ) : (
            <span title={glyph.label ?? undefined} className="flex size-4 shrink-0 items-center justify-center">{dot}</span>
          )}
          {subtitle ? (
            <span className="flex min-w-0 flex-1 flex-col justify-center">
              <Link thread={thread} isActive={isActive} stateLabel={glyph.label} splitProps={splitProps} onOpen={onOpen} />
              <span data-row-subtitle="" className="truncate text-2xs text-sidebar-foreground/50">{subtitle}</span>
            </span>
          ) : (
            <Link thread={thread} isActive={isActive} stateLabel={glyph.label} splitProps={splitProps} onOpen={onOpen} />
          )}
          {subtitle ? null : <span aria-hidden className="min-w-0 flex-1" />}
          {/* Above the overlay's fade, so hover and focus never hide or block them. */}
          <span className="relative z-[1] flex shrink-0 items-center gap-2 empty:hidden">
            {failed ? <RetryButton threadId={thread.id} /> : null}
            {pullRequest ? <PullRequestIcon pullRequest={pullRequest} /> : null}
            {sharesBranchWith ? (
              <span
                data-shared-branch=""
                role="img"
                aria-label={sharedBranchTooltip(branch, sharesBranchWith)}
                title={sharedBranchTooltip(branch, sharesBranchWith)}
                className="flex size-4 shrink-0 items-center justify-center text-amber-600 dark:text-amber-400"
              >
                <Icon name="TriangleAlert" fallback="AlertTriangle" aria-hidden className="size-3.5" />
              </span>
            ) : null}
            {view.showSubagents ? <SubagentBadge thread={thread} data={subagents} /> : null}
          </span>
          <span className="flex shrink-0 items-center justify-end gap-2" style={{ minWidth: isCompactViewport ? undefined : END_SLOT_MIN_PX }}>
            <span
              data-provider-icon={thread.providerId}
              title={providerName}
              className="flex size-3.5 shrink-0 items-center justify-center text-sidebar-foreground"
              style={{ color: providerTintColor(thread.providerId, view.providerIconStyle) ?? undefined }}
            >
              <ProviderIcon providerKind="agent" provider={untinted(provider, thread.providerId)} aria-label={providerName} className="size-3.5" />
            </span>
            {view.showAge ? (
              <span data-row-age="" className="-mr-1 shrink-0 whitespace-nowrap pr-1 text-right text-2xs tabular-nums text-sidebar-foreground/45">
                {age}
              </span>
            ) : null}
          </span>
        </div>
        {isCompactViewport ? null : (
          <span
            data-hover-actions=""
            className={cn(
              "absolute inset-y-0 right-0 flex items-center rounded-r-md",
              isActive ? ROW_FADE_ACTIVE : ROW_FADE_HOVER,
              hoverActionsClass(view.reduceMotion),
            )}
          >
            <span aria-hidden className={cn("h-full w-6", ROW_FADE_GRADIENT)} />
            <span className={cn("flex h-full items-center", ROW_FADE_SOLID)} style={{ gap: STRIP_GAP_PX, paddingRight: STRIP_END_PAD_PX }}>
              <ArchiveButton thread={target} />
              <ThreadActionsMenu
                thread={target}
                inline={stopInline}
                onOpenChange={setMenuOpen}
                align="start"
                trigger={(props) => (
                  <button
                    type="button"
                    aria-label="Thread actions"
                    title="Thread actions"
                    {...props}
                    className={ROW_ACTION_BUTTON}
                  >
                    <Icon name="MoreHorizontal" fallback="Ellipsis" aria-hidden className="size-3.5" />
                  </button>
                )}
              />
            </span>
          </span>
        )}
      </div>
    </ThreadActionsContextMenu>
  );
}

/** Shown only when the PR needs action; the reason is its tint and tooltip. */
function PullRequestIcon({ pullRequest }: { pullRequest: RowPullRequest }) {
  const navigate = useBbNavigate();
  const look = PR_REASON_LOOK[pullRequest.reason];
  const label = prTooltip(pullRequest);
  return (
    <button
      type="button"
      data-pr-reason={pullRequest.reason}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        navigate.openUrl(pullRequest.pr.url);
      }}
      className={cn("flex size-4 shrink-0 items-center justify-center rounded outline-none hover:bg-sidebar-foreground/10 focus-visible:ring-1 focus-visible:ring-sidebar-ring", look.className)}
    >
      <Icon name={look.icon} aria-hidden className="size-3.5" />
    </button>
  );
}

interface RowLinkProps {
  thread: PluginSidebarThread;
  isActive: boolean;
  stateLabel: string | null;
  splitProps: ReturnType<typeof useSidebarThreadSplit>["splitProps"];
  onOpen: (thread: PluginSidebarThread, event: MouseEvent) => void;
}

/** Only numbered rows subscribe: every subscriber re-renders when the modifier is pressed. */
function NumberedRowLink(props: RowLinkProps) {
  const shortcut = useSidebarThreadShortcut(props.thread.id);
  return <RowLink {...props} numbered shortcut={shortcut} />;
}

function RowLink({
  thread,
  isActive,
  stateLabel,
  splitProps,
  onOpen,
  numbered = false,
  shortcut = null,
}: RowLinkProps & { numbered?: boolean; shortcut?: PluginSidebarThreadShortcut | null }) {
  return (
    <>
      <a
        href={thread.href}
        {...(numbered ? { "data-sidebar-thread-shortcut-target": "", "data-sidebar-thread-id": thread.id } : {})}
        aria-current={isActive ? "page" : undefined}
        aria-label={stateLabel ? `${thread.displayTitle}, ${stateLabel}` : thread.displayTitle}
        aria-keyshortcuts={shortcut?.ariaKeyshortcuts}
        {...splitProps}
        onClick={(event) => onOpen(thread, event)}
        className="flex min-w-0 items-center gap-1.5 self-stretch outline-none"
      >
        <span className={cn("min-w-0 truncate", thread.isUnread && "font-semibold text-sidebar-foreground")}>
          <ThreadTitle threadId={thread.id} />
        </span>
      </a>
      {shortcut ? (
        <span aria-hidden data-shortcut-hint="" className="pointer-events-none absolute right-0 top-1/2 z-10 flex -translate-y-1/2 rounded bg-sidebar">
          <ShortcutHint shortcut={shortcut} />
        </span>
      ) : null}
    </>
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
      className={ROW_ACTION_BUTTON}
    >
      <Icon name={action.icon ?? "Archive"} fallback="Archive" aria-hidden className="size-3.5" />
    </button>
  );
}

async function stopThread(sdk: ReturnType<typeof useSdk>, threadId: string) {
  try {
    await sdk.threads.stop({ threadId });
  } catch (error) {
    toast.error("Stop failed", { description: error instanceof Error ? error.message : String(error) });
  }
}

/** The running glyph turns into Stop under the pointer, away from Archive at the row's other end. */
function StopGlyphButton({ threadId, stateLabel, children }: { threadId: string; stateLabel: string | null; children: React.ReactNode }) {
  const sdk = useSdk();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      data-stop-glyph=""
      aria-label="Stop"
      title={stateLabel ? `${stateLabel} · Click to stop` : "Stop"}
      disabled={pending}
      onClick={async (event) => {
        event.stopPropagation();
        setPending(true);
        await stopThread(sdk, threadId);
        setPending(false);
      }}
      className="group/stop -m-1 flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-none hover:bg-sidebar-foreground/10 focus-visible:ring-1 focus-visible:ring-sidebar-ring"
    >
      <span className="flex group-hover/stop:hidden group-focus-visible/stop:hidden group-disabled/stop:flex">{children}</span>
      <Icon name="Square" fallback="CircleStop" aria-hidden className="hidden size-3 fill-current group-hover/stop:block group-focus-visible/stop:block group-disabled/stop:hidden" />
    </button>
  );
}

/** Stop in the row's menus too: the only place a parent row offers it, and reachable by keyboard and touch. */
function useStopInlineAction(thread: PluginSidebarThread): PluginThreadActionsInlineItem[] | undefined {
  const sdk = useSdk();
  const running = canStop(thread);
  return useMemo(
    () => running ? [{ key: "thread-tree/stop", group: THREAD_ACTION_GROUPS.lifecycle, action: { label: "Stop", icon: "Square", run: () => stopThread(sdk, thread.id) } }] : undefined,
    [running, sdk, thread.id],
  );
}

const FOLD_STATES: readonly { state: FoldState; label: string }[] = [
  { state: "input", label: "needs input" },
  { state: "error", label: "failed" },
  { state: "running", label: "running" },
  { state: "waiting", label: "waiting" },
  { state: "unread", label: "to review" },
  { state: "done", label: "done" },
];

const FOLD_BAR_CLASS: Record<FoldState, string> = {
  input: DOT_CLASS.input,
  error: DOT_CLASS.error,
  running: DOT_CLASS.running,
  waiting: "bg-blue-500/40",
  unread: DOT_CLASS.done,
  done: "bg-sidebar-foreground/20",
};


/** The line under a folded parent: its whole subtree by state. Clicking it unfolds; a finished one offers Archive. */
function FoldLine({
  depth,
  guides,
  counts,
  own,
  total,
  onExpand,
  onArchive,
}: {
  depth: number;
  guides: boolean[];
  counts: FoldCounts;
  own: FoldState;
  total: number;
  onExpand: () => void;
  /** Absent in the archived view. */
  onArchive?: () => Promise<PreparedFoldArchive | null>;
}) {
  const finished = isFinishedFold(own, counts);
  const parts = finished ? [] : FOLD_STATES.filter(({ state }) => (counts[state] ?? 0) > 0);
  const segments = foldBarSegments(counts, total);
  const subthreads = `${total} subthread${total === 1 ? "" : "s"}${finished ? " · all done" : ""}`;
  const description = [subthreads, ...parts.map(({ state, label }) => `${counts[state]} ${label}`)].join(", ");
  return (
    <div role="none" data-fold-line="" className="relative flex h-6 items-center gap-1 pr-2" style={{ paddingLeft: ROW_PAD_PX + depth * INDENT_PX }}>
      <TreeGuides depth={depth} guides={guides} hasOpenChildren={false} isPeek centerY={12} />
      <button
        type="button"
        onClick={onExpand}
        title={`Expand: ${description}`}
        aria-label={`Expand subthreads: ${description}`}
        className={cn("-ml-1 flex h-5 min-w-0 items-center gap-2 overflow-hidden rounded-md px-1 text-2xs tabular-nums text-sidebar-foreground/50 outline-none hover:text-sidebar-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring", ROW_TINT)}
      >
        {segments.length > 0 ? (
          <span aria-hidden data-fold-bar="" className="flex h-1 w-10 shrink-0 overflow-hidden rounded-full bg-sidebar-foreground/10">
            {segments.map(({ state, fraction }) => (
              <span key={state} data-fold-segment={state} className={FOLD_BAR_CLASS[state]} style={{ width: `${fraction * 100}%` }} />
            ))}
          </span>
        ) : null}
        <span className="shrink-0">{subthreads}</span>
        {parts.map(({ state, label }) => (
          <span key={state} className="flex shrink-0 items-center gap-1">
            <RollupGlyph state={state} />
            {counts[state]} {label}
          </span>
        ))}
      </button>
      {finished && onArchive ? <FoldArchiveButton onArchive={onArchive} /> : null}
    </div>
  );
}

interface PreparedFoldArchive {
  plan: FoldArchivePlan;
  run(): Promise<void>;
}

/** Reads the fold's archive scope first; bb's own Archive then confirms each clean root, so a split tree gets the counts inline before that. */
function FoldArchiveButton({ onArchive }: { onArchive: () => Promise<PreparedFoldArchive | null> }) {
  const [step, setStep] = useState<"idle" | "pending" | { prepared: PreparedFoldArchive }>("idle");
  const button = "flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-2xs outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-60";
  const run = async (prepared: PreparedFoldArchive) => {
    setStep("pending");
    await prepared.run();
    setStep("idle");
  };
  if (typeof step === "string") {
    return (
      <button
        type="button"
        data-fold-archive=""
        disabled={step === "pending"}
        onClick={async () => {
          setStep("pending");
          const prepared = await onArchive();
          if (!prepared) return setStep("idle");
          const { plan } = prepared;
          if (plan.roots.length === 0) {
            toast.warning("Nothing archived", { description: skippedSummary(plan) ?? undefined });
            return setStep("idle");
          }
          if (plan.skipped + plan.kept === 0) return run(prepared);
          setStep({ prepared });
        }}
        className={cn(button, "ml-auto text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground")}
      >
        <Icon name="Archive" aria-hidden className="size-3" />
        {step === "pending" ? "Archiving…" : "Archive"}
      </button>
    );
  }
  const { plan } = step.prepared;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        data-fold-archive-confirm=""
        autoFocus
        title={skippedSummary(plan) ?? undefined}
        onClick={() => run(step.prepared)}
        className={cn(button, "bg-destructive/10 text-destructive hover:bg-destructive/20")}
      >
        {`Archive ${plan.archiveCount} · skip ${plan.skipped + plan.kept}`}
      </button>
      <button type="button" onClick={() => setStep("idle")} className={cn(button, "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground")}>
        Cancel
      </button>
    </span>
  );
}

interface BbArchiveJob {
  targets: PluginThreadActionTarget[];
  isStillClean(id: string): Promise<boolean>;
  finish(result: ArchiveRunResult): void;
}

/** Reads what archiving the fold takes along, picks the clean roots, and returns a run through bb's own Archive. */
async function prepareFoldArchive(
  rpc: ReturnType<typeof useRpc<typeof rpcContract>>,
  forest: Forest<PluginSidebarThread>,
  root: PluginSidebarThread,
  runBbArchive: (targets: PluginThreadActionTarget[], isStillClean: (id: string) => Promise<boolean>) => Promise<ArchiveRunResult>,
): Promise<PreparedFoldArchive | null> {
  const subtree = new Map([root, ...descendantsOf(forest, root.id)].map((thread) => [thread.id, thread]));
  const ids = [...subtree.keys()];
  const scopes = new Map<string, string[]>();
  const dirty = new Set<string>();
  try {
    for (let index = 0; index < ids.length; index += MAX_THREADS_PER_CALL) {
      const result = await rpc.call("archiveScope", { threadIds: ids.slice(index, index + MAX_THREADS_PER_CALL) });
      Object.entries(result.scopes).forEach(([id, scope]) => scopes.set(id, scope));
      result.dirty.forEach((id) => dirty.add(id));
    }
  } catch (error) {
    toast.error("Archive failed", { description: `Couldn't check worktrees for changes: ${error instanceof Error ? error.message : String(error)}` });
    return null;
  }
  const plan = foldArchivePlan(forest, root.id, scopes, dirty);
  const isStillClean = (id: string) => rpc.call("archiveScope", { threadIds: [id] }).then(({ dirty }) => dirty.length === 0, () => false);
  return {
    plan,
    async run() {
      const claimed = [...new Set(plan.roots.flatMap((id) => scopes.get(id) ?? [id]))];
      const claimId = await rpc.call("archiveClaim", { threadIds: claimed }).then(({ claimId }) => claimId, () => null);
      let result: ArchiveRunResult;
      try {
        result = await runBbArchive(plan.roots.map((id) => toActionTarget(subtree.get(id)!)), isStillClean);
      } finally {
        if (claimId !== null) await rpc.call("archiveRelease", { claimId }).catch(() => undefined);
      }
      const threadCount = (roots: readonly string[]) => new Set(roots.flatMap((id) => scopes.get(id) ?? [id])).size;
      const outcome = foldArchiveOutcome({ archived: threadCount(result.archived), skipped: plan.skipped, kept: plan.kept, changed: threadCount(result.changed), stop: result.stop });
      if (outcome) toast[outcome.tone](outcome.title, { description: outcome.description });
    },
  };
}

const BOUND_ARCHIVE_WAIT_MS = 2_000;
const ARCHIVE_POLL_MS = 500;
const ARCHIVE_WAIT_TOAST_ID = "thread-tree-fold-archive-wait";

/** Any dialog counts, a Radix modal carries no aria-modal; a stray popover only makes the wait longer. */
const dialogOpenBesides = (sidebar: Element | null) => () =>
  dialogOutsideSidebar(Array.from(document.querySelectorAll(`[role="dialog"], ${MODAL_DIALOG_SELECTOR}`)), sidebar);

/** Lives at list level: archiving a fold's root unmounts its fold line while later roots still wait for bb's confirmation. */
function BbArchiveRun({ job, sidebarRef }: { job: BbArchiveJob; sidebarRef: React.RefObject<HTMLElement | null> }) {
  const sdk = useSdk();
  const actions = useRef(new Map<string, () => Promise<void>>());
  const started = useRef(false);
  const stop = useRef(new AbortController());
  const [bound, setBound] = useState(0);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), BOUND_ARCHIVE_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => () => stop.current.abort(), []);
  useEffect(() => {
    if (started.current || (bound < job.targets.length && !waited)) return;
    started.current = true;
    const { signal } = stop.current;
    const deadline = Date.now() + ARCHIVE_CONFIRM_WAIT_MS;
    const landed = (threadId: string) => {
      toast.loading("Waiting for bb's confirmation…", {
        id: ARCHIVE_WAIT_TOAST_ID,
        duration: Infinity,
        action: { label: "Stop", onClick: () => stop.current.abort() },
      });
      return waitForArchive(() => sdk.threads.get({ threadId }).then((thread) => thread.archivedAt !== null, () => false), {
        dialogOpen: dialogOpenBesides(sidebarRef.current),
        deadline,
        intervalMs: ARCHIVE_POLL_MS,
        signal,
      });
    };
    archiveInTurn(job.targets.map((target) => target.id), { actionOf: (id) => actions.current.get(id), isStillClean: job.isStillClean, landed, signal })
      .catch((): ArchiveRunResult => ({ archived: [], changed: [], stop: "stopped" }))
      .then((result) => {
        toast.dismiss(ARCHIVE_WAIT_TOAST_ID);
        job.finish(result);
      });
  }, [bound, waited, job, sdk]);
  return job.targets.map((target) => (
    <BoundArchive
      key={target.id}
      target={target}
      onBound={(run) => {
        if (!actions.current.has(target.id)) setBound((count) => count + 1);
        actions.current.set(target.id, run);
      }}
    />
  ));
}

function BoundArchive({ target, onBound }: { target: PluginThreadActionTarget; onBound: (run: () => Promise<void>) => void }) {
  const [entry] = useThreadActions(target, { keys: [ARCHIVE_ACTION_KEY] });
  const run = entry && !entry.action.disabled ? entry.action.run : undefined;
  useEffect(() => {
    if (run) onBound(() => run());
  }, [run]);
  return null;
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
  centerY = 16,
}: {
  depth: number;
  guides: boolean[];
  hasOpenChildren: boolean;
  /** Dashed: the row shows through its parent's fold. */
  isPeek: boolean;
  centerY?: number;
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
              className={cn(ownLine, "top-0 rounded-bl-md border-b border-l")}
              style={{ left: lineX(level), height: centerY, width: INDENT_PX - GLYPH_CENTER_PX - 2 }}
            />
            {continues ? (
              <span aria-hidden className={cn(ownLine, "border-l")} style={{ left: lineX(level), top: centerY, bottom: -ROW_GAP_PX }} />
            ) : null}
          </span>
        );
      })}
      {hasOpenChildren ? (
        <span aria-hidden className={cn(line, "border-l")} style={{ left: lineX(depth), top: centerY + 7, bottom: -ROW_GAP_PX }} />
      ) : null}
    </>
  );
}

type RowProvider = ReturnType<typeof useProviders>["providers"][number];

/** Without bb's own tint the logo mask takes the slot's colour, which the plugin sets. */
function untinted(provider: RowProvider | undefined, id: string) {
  return { id, logoUrl: provider?.logoUrl ?? null, icon: provider?.icon ?? null };
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

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const THREAD_SORTS: readonly { id: ThreadSort; label: string }[] = [
  { id: "activity", label: "Last activity" },
  { id: "status", label: "Status" },
  { id: "created", label: "Creation date" },
];

function ThreadSortMenu(props: {
  title: string;
  value: ThreadSort | "inherit";
  defaultSort: ThreadSort;
  onChange: (sort: ThreadSort | "inherit") => void;
} | {
  title?: undefined;
  value: ThreadSort;
  defaultSort?: undefined;
  onChange: (sort: ThreadSort) => void;
}) {
  const { title, value, onChange } = props;
  const options: readonly { id: ThreadSort | "inherit"; label: string }[] = title !== undefined
    ? [{ id: "inherit", label: `Use global setting (${THREAD_SORTS.find((entry) => entry.id === props.defaultSort)!.label})` }, ...THREAD_SORTS]
    : THREAD_SORTS;
  const effectiveSort = value === "inherit" ? props.defaultSort : value;
  const portalProps = usePortalScopeProps();
  const menu = useTapToOpenMenu();
  return (
    <DropdownMenu.Root {...menu.rootProps}>
      <DropdownMenu.Trigger asChild {...menu.triggerProps}>
        <button
          type="button"
          aria-label={title !== undefined ? `Thread settings for ${title}` : "Sort threads"}
          title={title !== undefined ? "Thread settings" : "Sort threads"}
          className={title !== undefined
            ? "flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 opacity-0 outline-none hover:bg-sidebar-accent focus-visible:opacity-100 group-hover/header:opacity-100 data-[state=open]:opacity-100"
              + ` ${TOUCH_DIMMED}`
            : "flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"}
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
            <path d="M3 4h18l-7 8v8l-4-2v-6Z" />
          </svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content {...portalProps} align="end" sideOffset={4}
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <DropdownMenu.Label className="px-2 py-1 text-xs text-muted-foreground">Sort threads by</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={value} onValueChange={(next) => {
            const sort = THREAD_SORTS.find((entry) => entry.id === next);
            if (sort) onChange(sort.id);
            else if (next === "inherit" && props.title !== undefined) props.onChange("inherit");
          }}>
            {options.map((entry) => (
              <DropdownMenu.RadioItem key={entry.id} value={entry.id}
                onSelect={(event) => event.preventDefault()}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
                <span className="flex-1">{entry.label}</span>
                <DropdownMenu.ItemIndicator><Icon name="Check" aria-hidden className="size-3.5" /></DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <div className="max-w-56 px-2 pb-1 pt-1 text-xs text-muted-foreground">
            {effectiveSort === "created" ? "Newest first. Message activity keeps this order." : effectiveSort === "status"
              ? "Needs input, errors, working, then done. Newest first within each status."
              : "Most recently active first."}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
