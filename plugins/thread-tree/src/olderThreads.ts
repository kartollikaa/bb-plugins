// A project folder's quiet, day-old roots, folded into one "N older" line.
import { descendantsOf, foldState, type Forest, type TreeThread } from "./tree.ts";

export const OLDER_AFTER_MS = 24 * 60 * 60 * 1000;

export const OLDER_RULE =
  "Idle and read, no draft or pending question, not pinned or open, every subthread quiet too, pull requests merged, closed or none, and nothing new for over a day";

export interface OlderContext<T extends TreeThread> {
  now: number;
  activeThreadId: string | null;
  draftIds: ReadonlySet<string>;
  pullRequestStates: (thread: T) => readonly string[];
}

const SETTLED_PULL_REQUESTS: ReadonlySet<string> = new Set(["merged", "closed"]);

function isQuietAndOld<T extends TreeThread>(thread: T, context: OlderContext<T>): boolean {
  return (
    foldState(thread) === "done" &&
    !context.draftIds.has(thread.id) &&
    thread.id !== context.activeThreadId &&
    context.now - thread.updatedAt > OLDER_AFTER_MS &&
    context.pullRequestStates(thread).every((state) => SETTLED_PULL_REQUESTS.has(state))
  );
}

export function olderRoots<T extends TreeThread>(forest: Forest<T>, roots: readonly T[], context: OlderContext<T>): T[] {
  return roots.filter((root) => !root.isPinned && [root, ...descendantsOf(forest, root.id)].every((thread) => isQuietAndOld(thread, context)));
}
