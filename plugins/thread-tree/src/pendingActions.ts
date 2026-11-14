export interface PendingActions {
  /** Null when the action is already in flight; otherwise ends this run only, never a newer one. */
  begin(key: string): (() => void) | null;
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
  const runs = new Map<string, { timer?: number }>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const end = (key: string, run: { timer?: number }) => {
    if (runs.get(key) !== run) return;
    runs.delete(key);
    if (run.timer !== undefined) clearTimer(run.timer);
    notify();
  };
  return {
    begin(key) {
      if (runs.has(key)) return null;
      const run: { timer?: number } = {};
      runs.set(key, run);
      notify();
      run.timer = setTimer(() => end(key, run), expireMs);
      return () => end(key, run);
    },
    has: (key) => runs.has(key),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
