import { isThreadId } from "./route.ts";

const LOOKUP_LIMIT = 200;

/** Keyed reads share one key set per method, so one id the RPC rejects fails every caller's lookup. */
export function orchestratorLookupKeys(threadIds: readonly string[]): string[] {
  return [...new Set(threadIds.filter(isThreadId))].slice(0, LOOKUP_LIMIT);
}

/** The switch's last choice, shared by every switch on screen until the stored setting agrees. */
export function pendingSwitch() {
  let value: boolean | null = null;
  const listeners = new Set<() => void>();
  const update = (next: boolean | null) => {
    if (next === value) return;
    value = next;
    listeners.forEach((l) => l());
  };
  return {
    get: () => value,
    set: (next: boolean) => update(next),
    settle(stored: boolean) {
      if (value === stored) update(null);
    },
    clear: () => update(null),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
