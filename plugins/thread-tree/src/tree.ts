// Pure tree layout for the sidebar: threads nest under the thread that spawned
// them, across projects, so a subagent thread always sits beneath its parent.
import type { Subagent, SubagentState } from "./subagents";

export interface TreeThread {
  id: string;
  projectId: string;
  parentThreadId: string | null;
  lifecycleOwnerThreadId: string | null;
  isPinned: boolean;
  pinSortKey: string | null;
  pinnedAt: number | null;
  isHidden: boolean;
  isArchived: boolean;
  status: string;
  indicator: string;
  hasPendingInteraction: boolean;
  activity: { backgroundAgents: number; backgroundCommands: number; workflows: number };
  createdAt: number;
  updatedAt: number;
}

export interface TreeRow<T extends TreeThread> {
  thread: T;
  depth: number;
  descendantCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
  /** A collapsed thread's whole subtree by state; null when expanded or childless. */
  foldCounts: StateCounts | null;
  /** Shown through a collapsed ancestor: the open thread, or one that needs input. */
  isPeek: boolean;
  /** Thread rows hang directly beneath it: its children, or descendants peeking out of the fold. */
  hasVisibleChildren: boolean;
  /**
   * One entry per level above this row: whether that level's guide line runs
   * on past this row. The last entry is this row's own: false bends it into an
   * elbow because no sibling follows.
   */
  guides: boolean[];
}

/** Dot colors, shared by thread rollups and subagents. */
export type DotState = "input" | "error" | "running" | "done" | "stopped";

export type StateCounts = Partial<Record<DotState, number>>;

/** Most urgent first: what needs the user, then what broke, then live work. */
const THREAD_DOT_PRIORITY: readonly DotState[] = ["input", "error", "running", "done"];

export function threadDotState(thread: TreeThread): DotState {
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return "input";
  // A failed turn (an app exit, a daemon disconnect) stays failed until retried, read or not.
  if (thread.status === "error" || thread.indicator === "unread-error") return "error";
  if (isWorking(thread)) return "running";
  return "done";
}

function moreUrgent(a: DotState | null, b: DotState): DotState {
  if (a === null) return b;
  return THREAD_DOT_PRIORITY.indexOf(b) < THREAD_DOT_PRIORITY.indexOf(a) ? b : a;
}

export interface TreeGroup<T extends TreeThread> {
  /** `pinned`, or a project id. */
  key: string;
  projectId: string | null;
  rows: TreeRow<T>[];
  rootCount: number;
  latestActivityAt: number;
}

export interface Forest<T extends TreeThread> {
  roots: T[];
  children: ReadonlyMap<string, T[]>;
  parentOf: ReadonlyMap<string, string>;
}

/** The thread a row hangs under: its spawning parent, else its lifecycle owner. */
export function displayParentId<T extends TreeThread>(thread: T, byId: ReadonlyMap<string, T>): string | null {
  for (const candidate of [thread.parentThreadId, thread.lifecycleOwnerThreadId]) {
    if (candidate && candidate !== thread.id && byId.has(candidate)) return candidate;
  }
  return null;
}

const byActivity = (a: TreeThread, b: TreeThread) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
const bySpawnOrder = (a: TreeThread, b: TreeThread) => a.createdAt - b.createdAt || a.id.localeCompare(b.id);
const byPinOrder = (a: TreeThread, b: TreeThread) =>
  (a.pinSortKey ?? "").localeCompare(b.pinSortKey ?? "") || (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || a.id.localeCompare(b.id);

/**
 * Cycle-safe forest. A pinned thread detaches to the Pinned group with its
 * subtree; a parent cycle is broken by drawing its newest member as a root.
 * Takes one lifecycle at a time: archived threads form their own forest.
 */
export function buildForest<T extends TreeThread>(threads: readonly T[]): Forest<T> {
  const visible = threads.filter((thread) => !thread.isHidden);
  const byId = new Map(visible.map((thread) => [thread.id, thread]));
  const buckets = new Map<string, T[]>();
  const candidateRoots: T[] = [];
  for (const thread of visible) {
    const parentId = thread.isPinned ? null : displayParentId(thread, byId);
    if (parentId === null) {
      candidateRoots.push(thread);
      continue;
    }
    const bucket = buckets.get(parentId);
    if (bucket) bucket.push(thread);
    else buckets.set(parentId, [thread]);
  }

  const children = new Map<string, T[]>();
  const parentOf = new Map<string, string>();
  const visited = new Set<string>();
  const visit = (thread: T) => {
    visited.add(thread.id);
    const kids = (buckets.get(thread.id) ?? []).filter((kid) => !visited.has(kid.id)).sort(bySpawnOrder);
    children.set(thread.id, kids);
    for (const kid of kids) {
      parentOf.set(kid.id, thread.id);
      visit(kid);
    }
  };

  const roots = [...candidateRoots].sort(byActivity);
  for (const root of roots) visit(root);
  for (const thread of [...visible].sort(byActivity)) {
    if (visited.has(thread.id)) continue;
    roots.push(thread);
    visit(thread);
  }
  return { roots, children, parentOf };
}

/** Every ancestor of `threadId`, nearest first. */
export function ancestorsOf<T extends TreeThread>(forest: Forest<T>, threadId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([threadId]);
  let cursor = forest.parentOf.get(threadId);
  while (cursor && !seen.has(cursor)) {
    out.push(cursor);
    seen.add(cursor);
    cursor = forest.parentOf.get(cursor);
  }
  return out;
}

/** bb indicators that mean the thread is doing something right now. */
const WORKING_INDICATORS = new Set(["runtime", "background-agent", "background-command", "workflow", "working-draft"]);

export function isWorking(thread: TreeThread): boolean {
  if (thread.status === "active" || thread.status === "starting") return true;
  const { backgroundAgents, backgroundCommands, workflows } = thread.activity;
  if (backgroundAgents > 0 || backgroundCommands > 0 || workflows > 0) return true;
  return WORKING_INDICATORS.has(thread.indicator);
}

/**
 * Depth-first rows under each root. A collapsed thread hides its subtree except
 * the open thread and threads that need input, which peek out right beneath it.
 */
export function flattenRows<T extends TreeThread>(
  forest: Forest<T>,
  roots: readonly T[],
  collapsed: ReadonlySet<string>,
  activeThreadId: string | null = null,
): TreeRow<T>[] {
  const rows: TreeRow<T>[] = [];
  const kidsOf = (thread: T) => forest.children.get(thread.id) ?? [];
  const peeksOut = (thread: T) => thread.id === activeThreadId || threadDotState(thread) === "input";
  const counts = new Map<string, number>();
  const countOf = (thread: T): number => {
    const cached = counts.get(thread.id);
    if (cached !== undefined) return cached;
    const count = kidsOf(thread).reduce((sum, kid) => sum + 1 + countOf(kid), 0);
    counts.set(thread.id, count);
    return count;
  };
  const fold = (thread: T) => {
    const counts: StateCounts = {};
    const peeking: T[] = [];
    const visit = (kid: T, underPeek: boolean) => {
      const peeks = !underPeek && peeksOut(kid);
      if (peeks) peeking.push(kid);
      const state = threadDotState(kid);
      counts[state] = (counts[state] ?? 0) + 1;
      for (const grandkid of kidsOf(kid)) visit(grandkid, underPeek || peeks);
    };
    for (const kid of kidsOf(thread)) visit(kid, false);
    return { counts, peeking };
  };
  const walk = (thread: T, depth: number, guides: boolean[], isPeek: boolean) => {
    const kids = kidsOf(thread);
    const isExpanded = kids.length > 0 && !collapsed.has(thread.id);
    const folded = kids.length > 0 && !isExpanded ? fold(thread) : null;
    const below = folded ? folded.peeking : kids;
    rows.push({
      thread,
      depth,
      descendantCount: countOf(thread),
      hasChildren: kids.length > 0,
      isExpanded,
      foldCounts: folded?.counts ?? null,
      isPeek,
      hasVisibleChildren: below.length > 0,
      guides,
    });
    below.forEach((kid, index) => walk(kid, depth + 1, [...guides, index < below.length - 1], folded !== null));
  };
  for (const root of roots) walk(root, 0, [], false);
  return rows;
}

export type GroupMode = "project" | "status" | "none";
export type ThreadSort = "activity" | "created" | "status";
export type FolderSorts = Readonly<Record<string, ThreadSort>>;

export function readFolderSorts(raw: unknown): FolderSorts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, value]) =>
    value === "activity" || value === "created" || value === "status",
  ));
}

function sortRoots<T extends TreeThread>(forest: Forest<T>, roots: readonly T[], sort: ThreadSort): T[] {
  const byCreated = (a: T, b: T) => b.createdAt - a.createdAt || a.id.localeCompare(b.id);
  if (sort === "created") return [...roots].sort(byCreated);
  if (sort === "status") {
    const rank = new Map(roots.map((root) => [root.id, THREAD_DOT_PRIORITY.indexOf(subtreeDotState(forest, root))]));
    return [...roots].sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || byCreated(a, b));
  }
  return [...roots].sort(byActivity);
}

/**
 * Pinned first, then the mode's groups. Project groups order by latest
 * activity; status groups go most urgent first and file a root by the most
 * urgent state in its whole subtree.
 */
export function groupRows<T extends TreeThread>(
  forest: Forest<T>,
  collapsed: ReadonlySet<string>,
  mode: GroupMode = "project",
  /** Project ids in display order; null orders projects by latest activity. */
  projectOrder: readonly string[] | null = null,
  activeThreadId: string | null = null,
  folderSorts: FolderSorts = {},
  defaultSort: ThreadSort = "activity",
): TreeGroup<T>[] {
  const pinned = forest.roots.filter((root) => root.isPinned).sort(byPinOrder);
  const buckets = new Map<string, { projectId: string | null; roots: T[] }>();
  const add = (key: string, projectId: string | null, root: T) => {
    const bucket = buckets.get(key);
    if (bucket) bucket.roots.push(root);
    else buckets.set(key, { projectId, roots: [root] });
  };
  for (const root of forest.roots) {
    if (root.isPinned) continue;
    if (mode === "project") add(`project:${root.projectId}`, root.projectId, root);
    else if (mode === "status") add(`status:${subtreeDotState(forest, root)}`, null, root);
    else add("all", null, root);
  }
  const makeGroup = (key: string, projectId: string | null, roots: T[]): TreeGroup<T> => ({
    key,
    projectId,
    rootCount: roots.length,
    latestActivityAt: Math.max(0, ...roots.map((root) => root.updatedAt)),
    rows: flattenRows(forest, key === "pinned" ? roots : sortRoots(forest, roots, folderSorts[key] ?? defaultSort), collapsed, activeThreadId),
  });
  const rest = [...buckets].map(([key, bucket]) => makeGroup(key, bucket.projectId, bucket.roots));
  if (mode === "status") {
    const rank = (key: string) => THREAD_DOT_PRIORITY.indexOf(key.slice("status:".length) as DotState);
    rest.sort((a, b) => rank(a.key) - rank(b.key));
  } else if (mode === "project" && projectOrder) {
    const rank = (group: TreeGroup<T>) => {
      const index = projectOrder.indexOf(group.projectId ?? "");
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    rest.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
  } else {
    rest.sort((a, b) => b.latestActivityAt - a.latestActivityAt || a.key.localeCompare(b.key));
  }
  return pinned.length > 0 ? [makeGroup("pinned", null, pinned), ...rest] : rest;
}

function subtreeDotState<T extends TreeThread>(forest: Forest<T>, root: T): DotState {
  let state = threadDotState(root);
  const stack = [...(forest.children.get(root.id) ?? [])];
  for (let kid = stack.pop(); kid; kid = stack.pop()) {
    state = moreUrgent(state, threadDotState(kid));
    stack.push(...(forest.children.get(kid.id) ?? []));
  }
  return state;
}

/** Visible, unarchived threads counted by their own dot state. */
export function countStates(threads: readonly TreeThread[]): StateCounts {
  const counts: StateCounts = {};
  for (const thread of threads) {
    if (thread.isHidden || thread.isArchived) continue;
    const state = threadDotState(thread);
    counts[state] = (counts[state] ?? 0) + 1;
  }
  return counts;
}

/** The most recently active visible threads, children included, newest first. */
export function recentThreads<T extends TreeThread>(threads: readonly T[], limit: number): T[] {
  return threads
    .filter((thread) => !thread.isHidden && !thread.isArchived)
    .sort(byActivity)
    .slice(0, limit);
}

export interface SubagentSummary {
  total: number;
  running: number;
  failed: number;
  /** Live work first; a failure stays visible once nothing runs. */
  dot: DotState;
}

/**
 * A provider cannot report a subagent's end once its session is gone, so a
 * subagent still marked running under a thread with no live work is stopped.
 */
export function effectiveState(agent: Subagent, thread: TreeThread): SubagentState {
  if (agent.state !== "running") return agent.state;
  const turnRunning = thread.status === "active" || thread.status === "starting";
  const live = agent.background ? isWorking(thread) : turnRunning;
  return live ? "running" : "stopped";
}

export function summarize(total: number, agents: readonly Subagent[], thread: TreeThread): SubagentSummary {
  let running = 0;
  let failed = 0;
  for (const agent of agents) {
    const state = effectiveState(agent, thread);
    if (state === "running") running += 1;
    else if (state === "failed") failed += 1;
  }
  return { total, running, failed, dot: running > 0 ? "running" : failed > 0 ? "error" : "done" };
}

/**
 * The saved manual order, then every other project in bb's order with the
 * personal project first. Ids bb no longer lists drop out.
 */
export function resolveProjectOrder(
  saved: readonly string[],
  projects: readonly { id: string; isPersonal: boolean }[],
): string[] {
  const known = new Set(projects.map((project) => project.id));
  const kept = saved.filter((id, index) => known.has(id) && saved.indexOf(id) === index);
  const keptSet = new Set(kept);
  const rest = [...projects]
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal))
    .map((project) => project.id)
    .filter((id) => !keptSet.has(id));
  return [...kept, ...rest];
}


/** `order` with `moved` placed right before, or with `after` right after, `target`. */
export function placeNear<Id extends string>(order: readonly Id[], moved: Id, target: Id, after: boolean): Id[] {
  if (moved === target) return [...order];
  const without = order.filter((id) => id !== moved);
  const index = without.indexOf(target);
  if (index === -1) return [...order];
  const at = after ? index + 1 : index;
  return [...without.slice(0, at), moved, ...without.slice(at)];
}
