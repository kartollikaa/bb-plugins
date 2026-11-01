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
  /** The most urgent state among a collapsed thread's descendants. */
  hiddenState: DotState | null;
  /**
   * One entry per level above this row: whether that level's guide line runs
   * on past this row. The last entry is this row's own: false bends it into an
   * elbow because no sibling follows.
   */
  guides: boolean[];
}

/** Dot colors, shared by thread rollups and subagents. */
export type DotState = "input" | "error" | "running" | "done" | "stopped";

/** Most urgent first: what needs the user, then what broke, then live work. */
const THREAD_DOT_PRIORITY: readonly DotState[] = ["input", "error", "running", "done"];

export function threadDotState(thread: TreeThread): DotState {
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return "input";
  if (thread.indicator === "unread-error") return "error";
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
 */
export function buildForest<T extends TreeThread>(threads: readonly T[]): Forest<T> {
  const visible = threads.filter((thread) => !thread.isHidden && !thread.isArchived);
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

/** Depth-first rows under each root, skipping the subtrees of collapsed threads. */
export function flattenRows<T extends TreeThread>(
  forest: Forest<T>,
  roots: readonly T[],
  collapsed: ReadonlySet<string>,
): TreeRow<T>[] {
  const rows: TreeRow<T>[] = [];
  const stats = new Map<string, { count: number; state: DotState | null }>();
  const statsOf = (thread: T): { count: number; state: DotState | null } => {
    const cached = stats.get(thread.id);
    if (cached) return cached;
    let count = 0;
    let state: DotState | null = null;
    for (const kid of forest.children.get(thread.id) ?? []) {
      const kidStats = statsOf(kid);
      count += 1 + kidStats.count;
      state = moreUrgent(state, threadDotState(kid));
      if (kidStats.state) state = moreUrgent(state, kidStats.state);
    }
    const result = { count, state };
    stats.set(thread.id, result);
    return result;
  };
  const walk = (thread: T, depth: number, guides: boolean[]) => {
    const kids = forest.children.get(thread.id) ?? [];
    const isExpanded = kids.length > 0 && !collapsed.has(thread.id);
    const { count, state } = statsOf(thread);
    rows.push({
      thread,
      depth,
      descendantCount: count,
      hasChildren: kids.length > 0,
      isExpanded,
      hiddenState: isExpanded ? null : state,
      guides,
    });
    if (isExpanded) kids.forEach((kid, index) => walk(kid, depth + 1, [...guides, index < kids.length - 1]));
  };
  for (const root of roots) walk(root, 0, []);
  return rows;
}

export type GroupMode = "project" | "status" | "none";

/**
 * Pinned first, then the mode's groups. Project groups order by latest
 * activity; status groups go most urgent first and file a root by the most
 * urgent state in its whole subtree.
 */
export function groupRows<T extends TreeThread>(
  forest: Forest<T>,
  collapsed: ReadonlySet<string>,
  collapsedGroups: ReadonlySet<string>,
  mode: GroupMode = "project",
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
    rows: collapsedGroups.has(key) ? [] : flattenRows(forest, roots, collapsed),
  });
  const rest = [...buckets].map(([key, bucket]) => makeGroup(key, bucket.projectId, bucket.roots));
  if (mode === "status") {
    const rank = (key: string) => THREAD_DOT_PRIORITY.indexOf(key.slice("status:".length) as DotState);
    rest.sort((a, b) => rank(a.key) - rank(b.key));
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
