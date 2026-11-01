import { useCallback, useMemo, useState } from "react";

const PREFIX = "bb-plugin-subagent-tree:";

function read(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

/** A string set kept per client in localStorage, like bb's own collapse state. */
export function usePersistentSet(key: string) {
  const [values, setValues] = useState<ReadonlySet<string>>(() => read(key));

  const update = useCallback(
    (change: (next: Set<string>) => void) => {
      setValues((previous) => {
        const next = new Set(previous);
        change(next);
        try {
          window.localStorage.setItem(PREFIX + key, JSON.stringify([...next]));
        } catch {
          // Storage full or blocked: the state still applies for this session.
        }
        return next;
      });
    },
    [key],
  );

  return useMemo(
    () => ({
      values,
      has: (value: string) => values.has(value),
      toggle: (value: string) => update((next) => (next.has(value) ? next.delete(value) : next.add(value))),
      remove: (removed: readonly string[]) => update((next) => removed.forEach((value) => next.delete(value))),
    }),
    [values, update],
  );
}
