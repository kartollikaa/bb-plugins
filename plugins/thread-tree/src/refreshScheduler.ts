export interface Timers {
  setInterval(run: () => void, ms: number): number;
  clearInterval(id: number): void;
}

/**
 * Runs `refresh` every `intervalMs` while shown, stops while hidden, and catches up at once when
 * shown again if a tick was missed.
 */
export function createRefreshScheduler(refresh: () => void, intervalMs: number, timers: Timers) {
  let timer: number | null = null;
  let missed = false;
  let shown = false;
  return {
    setShown(next: boolean) {
      if (next === shown) return;
      shown = next;
      if (shown) {
        if (missed) refresh();
        missed = false;
        timer = timers.setInterval(refresh, intervalMs);
      } else {
        if (timer !== null) timers.clearInterval(timer);
        timer = null;
        missed = true;
      }
    },
    dispose() {
      if (timer !== null) timers.clearInterval(timer);
      timer = null;
    },
  };
}
