type FolderThread = { projectId: string; visibility: string };

type FolderStorage = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string[]): Promise<void>;
};

export function createProjectFolderHistory(
  storage: FolderStorage,
  listThreads: (args: { archived: boolean; includeHidden: boolean; limit: number; offset: number }) => Promise<{ threads: FolderThread[] }>,
) {
  const key = "used-project-folders";
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
  return {
    record: (thread: FolderThread) => serialize(async () => {
      if (thread.visibility === "hidden") return;
      const ids = await read();
      if (ids.has(thread.projectId)) return;
      ids.add(thread.projectId);
      await storage.set(key, [...ids]);
    }),
    list: () => serialize(async () => {
      const ids = await read();
      if (!seeded) {
        for (const archived of [false, true]) {
          for (let offset = 0; ; offset += 200) {
            const page = await listThreads({ archived, includeHidden: false, limit: 200, offset });
            for (const thread of page.threads) {
              if (thread.visibility !== "hidden") ids.add(thread.projectId);
            }
            if (page.threads.length < 200) break;
          }
        }
        await storage.set(key, [...ids]);
        seeded = true;
      }
      return [...ids];
    }),
  };
}
