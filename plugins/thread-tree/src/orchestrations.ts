// Orchestrators (threads with subthreads): the Orchestrations shortcuts, the folded rollup and fold bar, and archiving a finished fold.
import { addFoldState, descendantsOf, FOLD_PRIORITY, foldState, type FoldCounts, type FoldState, type Forest, type RollupState, type TreeThread } from "./tree.ts";

const rank = (state: FoldState) => FOLD_PRIORITY.indexOf(state);

export function mostUrgent(counts: FoldCounts): FoldState | null {
  return FOLD_PRIORITY.find((state) => (counts[state] ?? 0) > 0) ?? null;
}

/** The subtree's most urgent state when it outranks the parent's own; null keeps the parent's glyph. */
export function rollupOver(own: FoldState, counts: FoldCounts): RollupState | null {
  const below = mostUrgent(counts);
  return below !== null && below !== "done" && rank(below) < rank(own) ? below : null;
}

export function isFinishedFold(own: FoldState, counts: FoldCounts): boolean {
  return own === "done" && mostUrgent(counts) === "done";
}

export const FOLD_BAR_MIN_SUBTHREADS = 5;

export function foldBarSegments(counts: FoldCounts, total: number): { state: FoldState; fraction: number }[] {
  if (total < FOLD_BAR_MIN_SUBTHREADS) return [];
  return FOLD_PRIORITY.filter((state) => (counts[state] ?? 0) > 0).map((state) => ({ state, fraction: counts[state]! / total }));
}

export interface Orchestration<T extends TreeThread> {
  thread: T;
  /** Most urgent state across the orchestrator and its subtree. */
  state: FoldState;
  /** The subtree's state when it outranks the orchestrator's own. */
  rollup: RollupState | null;
  /** The orchestrator's project first, then its subthreads' in tree order. */
  projectIds: string[];
  total: number;
  done: number;
  needsYou: number;
  failed: number;
  running: number;
}

/** One entry per top-level thread with subthreads that still has work going: anything but done and read. */
export function orchestrations<T extends TreeThread>(forest: Forest<T>): Orchestration<T>[] {
  const out: Orchestration<T>[] = [];
  for (const root of forest.roots) {
    const subtree = descendantsOf(forest, root.id);
    if (subtree.length === 0) continue;
    const counts: FoldCounts = {};
    subtree.forEach((kid) => addFoldState(counts, kid));
    const own = foldState(root);
    const rollup = rollupOver(own, counts);
    const state = rollup ?? own;
    if (state === "done") continue;
    out.push({
      thread: root,
      state,
      rollup,
      projectIds: [...new Set([root.projectId, ...inTreeOrder(forest, root.id).map((kid) => kid.projectId)])],
      total: subtree.length,
      done: (counts.done ?? 0) + (counts.unread ?? 0),
      needsYou: counts.input ?? 0,
      failed: counts.error ?? 0,
      running: counts.running ?? 0,
    });
  }
  return out;
}

function inTreeOrder<T extends TreeThread>(forest: Forest<T>, rootId: string): T[] {
  const out: T[] = [];
  const visit = (id: string) => {
    for (const kid of forest.children.get(id) ?? []) {
      out.push(kid);
      visit(kid.id);
    }
  };
  visit(rootId);
  return out;
}

/** The orchestrator and every thread below it in the sidebar. */
export function orchestrationTreeIds<T extends TreeThread>(forest: Forest<T>, rootId: string): string[] {
  return [rootId, ...descendantsOf(forest, rootId).map((thread) => thread.id)];
}

export function orchestrationSubtitle(orchestration: Orchestration<TreeThread>, projectName: (projectId: string) => string | null): string {
  const projects = orchestration.projectIds.map(projectName).filter((name): name is string => !!name).join(" + ");
  return [
    projects || null,
    `${orchestration.done}/${orchestration.total} done`,
    orchestration.needsYou ? `${orchestration.needsYou} needs you` : null,
    orchestration.failed ? `${orchestration.failed} failed` : null,
    orchestration.running ? `${orchestration.running} running` : null,
  ].filter(Boolean).join(" · ");
}

export interface FoldArchivePlan {
  /** The highest threads whose archive takes nothing dirty along, for bb's own Archive. */
  roots: string[];
  /** Every thread those archives take, hidden ones included. */
  archiveCount: number;
  skipped: number;
  /** Clean threads, hidden ones included, that stay because archiving them would take a dirty one along. */
  kept: number;
}

/** `scopes`: what archiving each visible thread takes along, itself included; a thread without one counts as unsafe. */
export function foldArchivePlan<T extends TreeThread>(
  forest: Forest<T>,
  rootIds: string | readonly string[],
  scopes: ReadonlyMap<string, readonly string[]>,
  dirty: ReadonlySet<string>,
): FoldArchivePlan {
  const tops = typeof rootIds === "string" ? [rootIds] : rootIds;
  const roots: string[] = [];
  const covered = new Set<string>();
  const visit = (id: string) => {
    const scope = scopes.get(id);
    if (scope && !scope.some((each) => dirty.has(each))) {
      roots.push(id);
      scope.forEach((each) => covered.add(each));
      return;
    }
    for (const kid of forest.children.get(id) ?? []) visit(kid.id);
  };
  tops.forEach(visit);
  const fold = [...new Set(tops.flatMap((id) => [...orchestrationTreeIds(forest, id), ...(scopes.get(id) ?? [])]))];
  return {
    roots,
    archiveCount: covered.size,
    skipped: fold.filter((id) => dirty.has(id)).length,
    kept: fold.filter((id) => !covered.has(id) && !dirty.has(id)).length,
  };
}

/** What archiving each thread takes along: itself, bb's archive cascade and its hidden-inclusive descendants. */
export function archiveScopes(
  threadIds: readonly string[],
  cascade: readonly { threadId: string; cascadeThreadIds: readonly string[] }[],
  descendants: readonly { threadId: string; descendantIds: readonly string[] }[],
): Record<string, string[]> {
  const scopes = new Map(threadIds.map((id) => [id, new Set([id])]));
  cascade.forEach(({ threadId, cascadeThreadIds }) => cascadeThreadIds.forEach((id) => scopes.get(threadId)?.add(id)));
  descendants.forEach(({ threadId, descendantIds }) => descendantIds.forEach((id) => scopes.get(threadId)?.add(id)));
  return Object.fromEntries([...scopes].map(([id, scope]) => [id, [...scope]]));
}

/** The server's cap on thread ids per call, shared so the client chunks to match. */
export const MAX_THREADS_PER_CALL = 200;

const NOTHING_TO_LOSE = new Set(["path_not_found"]);

/** Environments whose worktree archiving could lose work: uncommitted or untracked changes, or a status that couldn't be read. */
export function dirtyEnvironmentIds(environmentIds: readonly string[], statuses: Readonly<Record<string, unknown>>): string[] {
  return environmentIds.filter((id) => {
    const status = statuses[id] as { outcome?: string; workspace?: { workingTree?: { hasUncommittedChanges?: boolean; state?: string } }; failure?: { code?: string } } | undefined;
    switch (status?.outcome) {
      case "available": {
        const tree = status.workspace?.workingTree;
        return !tree || tree.hasUncommittedChanges !== false || (tree.state !== "clean" && tree.state !== "committed_unmerged");
      }
      case "not_applicable":
        return false;
      case "unavailable":
        return !NOTHING_TO_LOSE.has(status.failure?.code ?? "");
      default:
        return true;
    }
  });
}
