export const VIEW_PATH = "orchestrator";

const THREAD_ID = /^thr_[a-z0-9]+$/i;

export function threadFromSubPath(subPath: string): string | null {
  const [first = ""] = subPath.split("/");
  let id: string;
  try {
    id = decodeURIComponent(first);
  } catch {
    return null;
  }
  return THREAD_ID.test(id) ? id : null;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type Surface = "view" | "chat";

const key = (threadId: string) => `orchestration.surface.${threadId}`;

/** Remembers, per orchestrator thread, that the owner last picked the full chat over the view. */
export function chatPreference(storage: PreferenceStorage | null) {
  return {
    prefersChat(threadId: string): boolean {
      try {
        return storage?.getItem(key(threadId)) === "chat";
      } catch {
        return false;
      }
    },
    set(threadId: string, surface: Surface): void {
      try {
        if (surface === "chat") storage?.setItem(key(threadId), "chat");
        else storage?.removeItem(key(threadId));
      } catch {
        // A blocked storage only costs the remembered choice.
      }
    },
  };
}

export function shouldOpenView({ isOrchestrator, prefersChat }: { isOrchestrator: boolean; prefersChat: boolean }): boolean {
  return isOrchestrator && !prefersChat;
}
