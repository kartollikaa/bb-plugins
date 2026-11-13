export interface BranchThread {
  id: string;
  projectId: string;
  displayTitle: string;
  isArchived: boolean;
  isHidden: boolean;
  environment: { id: string | null; branchName: string | null; path: string | null; isWorktree: boolean | null } | null;
}

/**
 * For each live thread, the other live threads on its branch or worktree. A project's own checkout
 * (isWorktree false) and threads of one family (an orchestrator and its subthreads) share by design.
 */
export function sharedBranchThreads<T extends BranchThread>(threads: readonly T[], familyOf: (threadId: string) => string = (id) => id): Map<string, T[]> {
  const byKey = new Map<string, T[]>();
  const keysOf = new Map<string, string[]>();
  for (const thread of threads) {
    const env = thread.environment;
    if (thread.isArchived || thread.isHidden || !env || env.isWorktree === false) continue;
    const keys = [
      ...(env.path ? [`path:${env.path}`] : []),
      ...(env.branchName ? [`branch:${thread.projectId}:${env.branchName}`] : []),
    ];
    keysOf.set(thread.id, keys);
    for (const key of keys) {
      const bucket = byKey.get(key);
      if (bucket) bucket.push(thread);
      else byKey.set(key, [thread]);
    }
  }
  const result = new Map<string, T[]>();
  for (const thread of threads) {
    const others = new Map<string, T>();
    for (const key of keysOf.get(thread.id) ?? []) {
      for (const other of byKey.get(key) ?? []) if (familyOf(other.id) !== familyOf(thread.id)) others.set(other.id, other);
    }
    if (others.size > 0) result.set(thread.id, [...others.values()]);
  }
  return result;
}

export function sharedBranchTooltip(branch: string | null, others: readonly { displayTitle: string }[]): string {
  const where = branch ? `Branch ${branch}` : "This worktree";
  const named = others.slice(0, 2).map((other) => `“${other.displayTitle}”`).join(", ");
  return `${where} is also used by ${named}${others.length > 2 ? ` and ${others.length - 2} more` : ""}`;
}
