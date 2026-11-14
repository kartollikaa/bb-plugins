// A project folder's quiet, day-old roots, folded into one "N older" line.
import { descendantsOf, foldState, type Forest, type TreeThread } from "./tree.ts";

export const OLDER_AFTER_MS = 24 * 60 * 60 * 1000;

export const OLDER_RULE =
  "Idle and read, no draft or pending question, not pinned, every subthread quiet too, pull requests merged, closed or none, and no activity for over a day";

export interface OlderContext<T extends TreeThread> {
  now: number;
  activeThreadId: string | null;
  /** The open thread's tree was in an expanded "N older" list when opened, so opening it doesn't pull it out. */
  activeWasOlder: boolean;
  draftIds: ReadonlySet<string>;
  /** Null while unknown, which keeps the thread out. */
  pullRequestStates: (thread: T) => readonly string[] | null;
}

const SETTLED_PULL_REQUESTS: ReadonlySet<string> = new Set(["merged", "closed"]);

function isQuietAndOld<T extends TreeThread>(thread: T, context: OlderContext<T>): boolean {
  return (
    foldState(thread) === "done" &&
    !context.draftIds.has(thread.id) &&
    context.now - thread.latestAttentionAt > OLDER_AFTER_MS &&
    (context.pullRequestStates(thread)?.every((state) => SETTLED_PULL_REQUESTS.has(state)) ?? false)
  );
}

export function isOlderRoot<T extends TreeThread>(forest: Forest<T>, root: T, context: OlderContext<T>): boolean {
  const tree = [root, ...descendantsOf(forest, root.id)];
  if (!context.activeWasOlder && tree.some((thread) => thread.id === context.activeThreadId)) return false;
  return !root.isPinned && tree.every((thread) => isQuietAndOld(thread, context));
}

/** The folded root whose tree holds `threadId`, if any. */
export function foldedRootOf<T extends TreeThread>(forest: Forest<T>, olderIds: ReadonlySet<string>, threadId: string | null): T | null {
  if (threadId === null) return null;
  return forest.roots.find((root) => olderIds.has(root.id) && (root.id === threadId || descendantsOf(forest, root.id).some((thread) => thread.id === threadId))) ?? null;
}

export function olderRootIds<T extends TreeThread>(forest: Forest<T>, context: OlderContext<T>): Set<string> {
  return new Set(forest.roots.filter((root) => isOlderRoot(forest, root, context)).map((root) => root.id));
}

export function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}
