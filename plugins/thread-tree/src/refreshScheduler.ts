export interface Timers {
  setInterval(run: () => void, ms: number): number;
  clearInterval(id: number): void;
  setTimeout(run: () => void, ms: number): number;
  clearTimeout(id: number): void;
  now(): number;
}

export interface RefreshSchedulerOptions {
  refreshAll: () => void;
  refreshKeys: (keys: string[]) => void;
  intervalMs: number;
  debounceMs: number;
  timers: Timers;
}

export function createRefreshScheduler({ refreshAll, refreshKeys, intervalMs, debounceMs, timers }: RefreshSchedulerOptions) {
  let interval: number | null = null;
  let catchUp: number | null = null;
  let debounce: number | null = null;
  let shown = false;
  let lastFullRefresh = timers.now();
  const pending = new Set<string>();

  const tick = () => {
    lastFullRefresh = timers.now();
    pending.clear();
    refreshAll();
  };
  const flush = () => {
    debounce = null;
    if (pending.size === 0) return;
    const keys = [...pending];
    pending.clear();
    refreshKeys(keys);
  };
  const tickThenRepeat = () => {
    catchUp = null;
    tick();
    interval = timers.setInterval(tick, intervalMs);
  };
  const stopTimers = () => {
    if (interval !== null) timers.clearInterval(interval);
    if (catchUp !== null) timers.clearTimeout(catchUp);
    if (debounce !== null) timers.clearTimeout(debounce);
    interval = null;
    catchUp = null;
    debounce = null;
  };

  return {
    setShown(next: boolean) {
      if (next === shown) return;
      shown = next;
      if (!shown) return stopTimers();
      const elapsed = timers.now() - lastFullRefresh;
      if (elapsed >= intervalMs) return tickThenRepeat();
      flush();
      catchUp = timers.setTimeout(tickThenRepeat, intervalMs - elapsed);
    },
    /** Hidden, the keys wait for the sidebar to show again. */
    requestKeys(keys: readonly string[]) {
      for (const key of keys) pending.add(key);
      if (shown && debounce === null && pending.size > 0) debounce = timers.setTimeout(flush, debounceMs);
    },
    dispose() {
      shown = false;
      stopTimers();
    },
  };
}
