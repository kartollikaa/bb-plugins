// Project folders with no activity for the configured window, moved behind one "N inactive projects" fold.
import { ancestorsOf, descendantsOf, threadDotState, type Forest, type TreeThread } from "./tree.ts";

export const HOUR_MS = 60 * 60 * 1000;

export function inactiveRule(hours: number): string {
  return `No turn in any of its threads, archived ones included, for over ${hours === 1 ? "an hour" : `${hours} hours`}; none running, waiting, asking or failed, and none pinned`;
}

export interface InactiveContext {
  now: number;
  /** 0 turns hiding off. */
  hideAfterHours: number;
  activeThreadId: string | null;
  /** The open thread's folder sat in the expanded fold when it was opened, so opening it doesn't pull the folder out. */
  activeWasInactive: boolean;
  /** The server's per-project last turn: covers archived threads and subthread turns, which `latestAttentionAt` misses. */
  lastActivityAt: Readonly<Record<string, number>>;
}

/** The folder a thread is drawn in: its display root's project. */
export function folderProjectOf<T extends TreeThread>(forest: Forest<T>, threadId: string | null): string | null {
  if (threadId === null) return null;
  const rootId = ancestorsOf(forest, threadId).at(-1) ?? threadId;
  const root = forest.roots.find((thread) => thread.id === rootId);
  return root && !root.isPinned ? root.projectId : null;
}

/** Of `projectIds`, the folders whose whole trees are quiet and older than the window. */
export function inactiveProjectIds<T extends TreeThread>(forest: Forest<T>, projectIds: readonly string[], context: InactiveContext): Set<string> {
  const hidden = new Set<string>();
  if (!(context.hideAfterHours > 0)) return hidden;
  const cutoff = context.now - context.hideAfterHours * HOUR_MS;
  const activeProject = context.activeWasInactive ? null : folderProjectOf(forest, context.activeThreadId);
  for (const projectId of projectIds) {
    if (projectId === activeProject) continue;
    if ((context.lastActivityAt[projectId] ?? 0) >= cutoff) continue;
    if (forest.roots.some((root) => root.isPinned && root.projectId === projectId)) continue;
    const trees = forest.roots.filter((root) => !root.isPinned && root.projectId === projectId).flatMap((root) => [root, ...descendantsOf(forest, root.id)]);
    const quiet = trees.every((thread) => threadDotState(thread) === "done" && thread.latestAttentionAt < cutoff);
    if (quiet) hidden.add(projectId);
  }
  return hidden;
}
