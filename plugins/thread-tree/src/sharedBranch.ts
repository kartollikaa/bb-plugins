export interface BranchThread {
  id: string;
  projectId: string;
  displayTitle: string;
  isArchived: boolean;
  isHidden: boolean;
  parentThreadId: string | null;
  environment: { id: string | null; branchName: string | null; path: string | null; isWorktree: boolean | null; providerId: string | null } | null;
}

export function familyRootOf(
  threads: readonly { id: string; parentThreadId: string | null; lifecycleOwnerThreadId: string | null; isHidden?: boolean }[],
): (threadId: string) => string {
  const drawn = new Set(threads.filter((thread) => !thread.isHidden).map((thread) => thread.id));
  // Same choice as buildForest; with neither drawn, the missing id still groups its children.
  const parentOf = new Map(threads.map((thread) => {
    const candidates = [thread.parentThreadId, thread.lifecycleOwnerThreadId].filter((id): id is string => !!id && id !== thread.id);
    return [thread.id, candidates.find((id) => drawn.has(id)) ?? candidates[0] ?? null];
  }));
  return (threadId) => {
    const seen = new Set<string>();
    let id = threadId;
    while (!seen.has(id)) {
      seen.add(id);
      const parent = parentOf.get(id);
      if (!parent) return id;
      id = parent;
    }
    return id;
  };
}

/** A project's own checkout and one orchestration family share a branch by design. */
export function sharedBranchThreads<T extends BranchThread>(threads: readonly T[], familyOf: (threadId: string) => string = (id) => id): Map<string, T[]> {
  const byKey = new Map<string, T[]>();
  const keysOf = new Map<string, string[]>();
  for (const thread of threads) {
    const env = thread.environment;
    if (thread.isArchived || thread.isHidden || !env || env.isWorktree !== true || env.providerId === null) continue;
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

