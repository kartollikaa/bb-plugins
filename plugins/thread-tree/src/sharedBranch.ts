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
 * (isWorktree false) is shared by design, so it never warns.
 */
export function sharedBranchThreads<T extends BranchThread>(threads: readonly T[]): Map<string, T[]> {
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
      for (const other of byKey.get(key) ?? []) if (other.id !== thread.id) others.set(other.id, other);
    }
    if (others.size > 0) result.set(thread.id, [...others.values()]);
  }
  return result;
}

export function sharedBranchTooltip(branch: string | null, others: readonly { displayTitle: string }[]): string {
  const where = branch ? `Branch ${branch}` : "This worktree";
  return `${where} is also used by ${others.map((other) => `“${other.displayTitle}”`).join(", ")}`;
}
