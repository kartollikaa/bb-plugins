export interface PendingActions {
  begin(key: string): boolean;
  end(key: string): void;
  has(key: string): boolean;
  subscribe(listener: () => void): () => void;
}

export interface PendingActionTimers {
  /** A call that never settles frees its button after this long. */
  expireMs?: number;
  setTimer?: (run: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

/** Thread actions in flight, shared by every copy of their button so a second click can't send twice. */
export function createPendingActions({
  expireMs = 30_000,
  setTimer = (run, ms) => setTimeout(run, ms) as unknown as number,
  clearTimer = (id) => clearTimeout(id),
}: PendingActionTimers = {}): PendingActions {
  const timers = new Map<string, number>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const end = (key: string) => {
    const timer = timers.get(key);
    if (timer === undefined) return;
    timers.delete(key);
    clearTimer(timer);
    notify();
  };
  return {
    begin(key) {
      if (timers.has(key)) return false;
      const timer = setTimer(() => {
        if (timers.get(key) === timer) end(key);
      }, expireMs);
      timers.set(key, timer);
      notify();
      return true;
    },
    end,
    has: (key) => timers.has(key),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
