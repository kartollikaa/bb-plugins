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
  activity: { backgroundAgents: number };
  createdAt: number;
  updatedAt: number;
}

export interface TreeRow<T extends TreeThread> {
  thread: T;
  depth: number;
  descendantCount: number;
  hasChildren: boolean;
  isExpanded: boolean;
  /** A collapsed descendant is still working. */
  hasHiddenActivity: boolean;
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

function isWorking(thread: TreeThread): boolean {
  return thread.status === "active" || thread.status === "starting" || thread.activity.backgroundAgents > 0;
}

/** Depth-first rows under each root, skipping the subtrees of collapsed threads. */
export function flattenRows<T extends TreeThread>(
  forest: Forest<T>,
  roots: readonly T[],
  collapsed: ReadonlySet<string>,
): TreeRow<T>[] {
  const rows: TreeRow<T>[] = [];
  const stats = new Map<string, { count: number; working: boolean }>();
  const statsOf = (thread: T): { count: number; working: boolean } => {
    const cached = stats.get(thread.id);
    if (cached) return cached;
    let count = 0;
    let working = false;
    for (const kid of forest.children.get(thread.id) ?? []) {
      const kidStats = statsOf(kid);
      count += 1 + kidStats.count;
      working ||= isWorking(kid) || kidStats.working;
    }
    const result = { count, working };
    stats.set(thread.id, result);
    return result;
  };
  const walk = (thread: T, depth: number) => {
    const kids = forest.children.get(thread.id) ?? [];
    const isExpanded = kids.length > 0 && !collapsed.has(thread.id);
    const { count, working } = statsOf(thread);
    rows.push({
      thread,
      depth,
      descendantCount: count,
      hasChildren: kids.length > 0,
      isExpanded,
      hasHiddenActivity: !isExpanded && working,
    });
    if (isExpanded) for (const kid of kids) walk(kid, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return rows;
}

/** Pinned first, then one group per project, most recently active first. */
export function groupRows<T extends TreeThread>(
  forest: Forest<T>,
  collapsed: ReadonlySet<string>,
  collapsedGroups: ReadonlySet<string>,
): TreeGroup<T>[] {
  const pinned = forest.roots.filter((root) => root.isPinned).sort(byPinOrder);
  const byProject = new Map<string, T[]>();
  for (const root of forest.roots) {
    if (root.isPinned) continue;
    const bucket = byProject.get(root.projectId);
    if (bucket) bucket.push(root);
    else byProject.set(root.projectId, [root]);
  }
  const groups: TreeGroup<T>[] = [];
  const makeGroup = (key: string, projectId: string | null, roots: T[]): TreeGroup<T> => ({
    key,
    projectId,
    rootCount: roots.length,
    latestActivityAt: Math.max(0, ...roots.map((root) => root.updatedAt)),
    rows: collapsedGroups.has(key) ? [] : flattenRows(forest, roots, collapsed),
  });
  if (pinned.length > 0) groups.push(makeGroup("pinned", null, pinned));
  const projectGroups = [...byProject].map(([projectId, roots]) => makeGroup(`project:${projectId}`, projectId, roots));
  projectGroups.sort((a, b) => b.latestActivityAt - a.latestActivityAt || a.key.localeCompare(b.key));
  return [...groups, ...projectGroups];
}

export interface SubagentSummary {
  total: number;
  running: number;
  failed: number;
  dot: "running" | "failed" | "done";
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
  return { total, running, failed, dot: running > 0 ? "running" : failed > 0 ? "failed" : "done" };
}
