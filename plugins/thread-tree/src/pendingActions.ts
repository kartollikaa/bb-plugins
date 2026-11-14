export interface PendingActions {
  begin(key: string): boolean;
  end(key: string): void;
  has(key: string): boolean;
  subscribe(listener: () => void): () => void;
}

/** Thread actions in flight, shared by every copy of their button so a second click can't send twice. */
export function createPendingActions(): PendingActions {
  const keys = new Set<string>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    begin(key) {
      if (keys.has(key)) return false;
      keys.add(key);
      notify();
      return true;
    },
    end(key) {
      if (keys.delete(key)) notify();
    },
    has: (key) => keys.has(key),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
