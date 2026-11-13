import { descendantsOf, type Forest, type TreeThread } from "./tree.ts";

export interface ActivityThread {
  id: string;
  status: string;
  updatedAt: string | number;
}

/** A running turn keeps one signature, so a streaming agent never triggers a PR refetch. */
export function activitySignatures(threads: readonly ActivityThread[]): Map<string, string> {
  return new Map(threads.map((thread) => [
    thread.id,
    thread.status === "active" || thread.status === "starting" ? "running" : `${thread.status}|${thread.updatedAt}`,
  ]));
}

/** New keys are left out: the keyed query loads them itself. */
export function changedKeys(previous: ReadonlyMap<string, string>, next: ReadonlyMap<string, string>): string[] {
  const changed: string[] = [];
  for (const [id, signature] of next) {
    const before = previous.get(id);
    if (before !== undefined && before !== signature) changed.push(id);
  }
  return changed;
}

/** Recent Activity draws the active forest even when the tree lists archived threads, so both need PRs. */
export function pullRequestThreads<T extends TreeThread>(activeForest: Forest<T>, shownForest: Forest<T>): T[] {
  const byId = new Map<string, T>();
  for (const forest of [activeForest, shownForest]) {
    for (const root of forest.roots) for (const thread of [root, ...descendantsOf(forest, root.id)]) if (!byId.has(thread.id)) byId.set(thread.id, thread);
  }
  return [...byId.values()];
}
