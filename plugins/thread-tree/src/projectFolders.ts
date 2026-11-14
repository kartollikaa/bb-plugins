type FolderThread = { id?: string; parentThreadId?: string | null; projectId: string; visibility: string; latestAttentionAt?: number };

type FolderStorage = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string[] | Record<string, number>): Promise<void>;
};

export interface ProjectFolders {
  projectIds: string[];
  /** Each project's last turn, archived threads and subthreads included; a subthread's turn also counts for its ancestors' projects. */
  lastActivityAt: Record<string, number>;
}

export function createProjectFolderHistory(
  storage: FolderStorage,
  listThreads: (args: { archived: boolean; includeHidden: boolean; limit: number; offset: number }) => Promise<{ threads: FolderThread[] }>,
) {
  const key = "used-project-folders";
  const activityKey = "project-activity";
  let queue: Promise<unknown> = Promise.resolve();
  let seeded = false;
  const serialize = <T,>(run: () => Promise<T>): Promise<T> => {
    const result = queue.then(run);
    queue = result.catch(() => undefined);
    return result;
  };
  const read = async () => {
    const raw = await storage.get(key);
    return new Set<string>(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []);
  };
  const readActivity = async () => {
    const raw = await storage.get(activityKey);
    const activity: Record<string, number> = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [projectId, at] of Object.entries(raw)) if (typeof at === "number" && Number.isFinite(at)) activity[projectId] = at;
    }
    return activity;
  };
  const bump = (activity: Record<string, number>, projectId: string, at: number) => {
    if (!(at > (activity[projectId] ?? 0))) return false;
    activity[projectId] = at;
    return true;
  };
  return {
    record: (thread: FolderThread) => serialize(async () => {
      if (thread.visibility === "hidden") return;
      const ids = await read();
      if (ids.has(thread.projectId)) return;
      ids.add(thread.projectId);
      await storage.set(key, [...ids]);
    }),
    /** A turn started, ended or failed in a thread of `projectIds`: its own project and its ancestors'. */
    recordActivity: (projectIds: readonly string[], at: number) => serialize(async () => {
      const activity = await readActivity();
      let changed = false;
      for (const projectId of projectIds) changed = bump(activity, projectId, at) || changed;
      if (changed) await storage.set(activityKey, activity);
    }),
    list: () => serialize(async (): Promise<ProjectFolders> => {
      const ids = await read();
      const activity = await readActivity();
      if (!seeded) {
        const byId = new Map<string, FolderThread>();
        const visible: FolderThread[] = [];
        for (const archived of [false, true]) {
          for (let offset = 0; ; offset += 200) {
            const page = await listThreads({ archived, includeHidden: false, limit: 200, offset });
            for (const thread of page.threads) {
              if (thread.id) byId.set(thread.id, thread);
              if (thread.visibility !== "hidden") visible.push(thread);
            }
            if (page.threads.length < 200) break;
          }
        }
        for (const thread of visible) {
          ids.add(thread.projectId);
          if (typeof thread.latestAttentionAt !== "number") continue;
          for (const projectId of lineageProjectIds(thread, (id) => byId.get(id))) bump(activity, projectId, thread.latestAttentionAt);
        }
        await storage.set(key, [...ids]);
        await storage.set(activityKey, activity);
        seeded = true;
      }
      return { projectIds: [...ids], lastActivityAt: activity };
    }),
  };
}

/** The thread's project, then each ancestor's, without repeats. */
export function lineageProjectIds(thread: FolderThread, lookup: (id: string) => FolderThread | undefined): string[] {
  const projectIds = [thread.projectId];
  const seen = new Set(thread.id ? [thread.id] : []);
  for (let parentId = thread.parentThreadId; parentId && !seen.has(parentId); ) {
    seen.add(parentId);
    const parent = lookup(parentId);
    if (!parent) break;
    if (!projectIds.includes(parent.projectId)) projectIds.push(parent.projectId);
    parentId = parent.parentThreadId;
  }
  return projectIds;
}
