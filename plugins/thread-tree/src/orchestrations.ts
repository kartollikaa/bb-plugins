// Orchestrators (threads with subthreads): the Orchestrations shortcuts, the folded rollup and fold bar, and archiving a finished fold.
import { descendantsOf, FOLD_PRIORITY, foldState, type FoldCounts, type FoldState, type Forest, type TreeThread } from "./tree.ts";

const rank = (state: FoldState) => FOLD_PRIORITY.indexOf(state);

export function mostUrgent(counts: FoldCounts): FoldState | null {
  return FOLD_PRIORITY.find((state) => (counts[state] ?? 0) > 0) ?? null;
}

/** The subtree's most urgent state when it outranks the parent's own; null keeps the parent's glyph. */
export function rollupOver(own: FoldState, counts: FoldCounts): FoldState | null {
  const below = mostUrgent(counts);
  return below !== null && rank(below) < rank(own) ? below : null;
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
    for (const kid of subtree) counts[foldState(kid)] = (counts[foldState(kid)] ?? 0) + 1;
    const own = foldState(root);
    const state = rollupOver(own, counts) ?? own;
    if (state === "done") continue;
    out.push({
      thread: root,
      state,
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

/** The orchestrator and every thread below it: what a shortcut click unfolds and highlights. */
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

export interface ArchivePlan {
  /** Children before parents, so nothing is archived while a thread below it stays. */
  archive: string[];
  skipped: string[];
  /** Ancestors of a skipped thread: archiving them could take the skipped one along. */
  kept: string[];
}

export function archivePlan<T extends TreeThread>(forest: Forest<T>, rootId: string, dirtyThreadIds: ReadonlySet<string>): ArchivePlan {
  const plan: ArchivePlan = { archive: [], skipped: [], kept: [] };
  const visit = (id: string): boolean => {
    let keep = false;
    for (const kid of forest.children.get(id) ?? []) keep = visit(kid.id) || keep;
    if (dirtyThreadIds.has(id)) plan.skipped.push(id);
    else if (keep) plan.kept.push(id);
    else plan.archive.push(id);
    return keep || dirtyThreadIds.has(id);
  };
  visit(rootId);
  return plan;
}

/** Threads below the listed ones that aren't listed themselves: hidden from the sidebar, so the client couldn't check them. */
export function unlistedDescendantIds(order: readonly string[], descendants: ReadonlyMap<string, readonly string[]>): string[] {
  const listed = new Set(order);
  return [...new Set(order.flatMap((id) => descendants.get(id) ?? []))].filter((id) => !listed.has(id));
}

/** Archiving a thread takes its hidden subthreads along, so one with changes holds back every listed thread above it. */
export function holdForHiddenChanges(
  order: readonly string[],
  descendants: ReadonlyMap<string, readonly string[]>,
  dirtyHidden: ReadonlySet<string>,
): { archive: string[]; held: string[]; skipped: string[] } {
  const result = { archive: [] as string[], held: [] as string[], skipped: [] as string[] };
  const skipped = new Set<string>();
  for (const id of order) {
    const below = (descendants.get(id) ?? []).filter((kid) => dirtyHidden.has(kid));
    below.forEach((kid) => skipped.add(kid));
    (below.length > 0 ? result.held : result.archive).push(id);
  }
  result.skipped = [...skipped];
  return result;
}

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
