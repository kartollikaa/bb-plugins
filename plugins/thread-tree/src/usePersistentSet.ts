import { useCallback, useMemo, useState } from "react";

const PREFIX = "bb-plugin-thread-tree:";

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

/** One choice out of a fixed list, kept per client; an unknown stored value falls back. */
export function usePersistentChoice<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(PREFIX + key);
      return allowed.includes(stored as T) ? (stored as T) : fallback;
    } catch {
      return fallback;
    }
  });
  const choose = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(PREFIX + key, next);
      } catch {
        // Storage full or blocked: the choice still applies for this session.
      }
    },
    [key],
  );
  return [value, choose] as const;
}

/** An ordered string list kept per client. */
export function usePersistentList(key: string) {
  const [values, setValues] = useState<readonly string[]>(() => [...read(key)]);
  const save = useCallback(
    (next: readonly string[]) => {
      setValues(next);
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(next));
      } catch {
        // Storage full or blocked: the order still applies for this session.
      }
    },
    [key],
  );
  return [values, save] as const;
}

export function usePersistentRecord<T>(key: string, parse: (raw: unknown) => Readonly<Record<string, T>>) {
  const [values, setValues] = useState(() => {
    try {
      return parse(JSON.parse(window.localStorage.getItem(PREFIX + key) ?? "null"));
    } catch {
      return parse(null);
    }
  });
  const save = useCallback((entry: string, value: T | undefined) => {
    setValues((previous) => {
      const { [entry]: _removed, ...rest } = previous;
      const next = value === undefined ? rest : { ...previous, [entry]: value };
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(next));
      } catch {
        // Storage full or blocked: the choice still applies for this session.
      }
      return next;
    });
  }, [key]);
  return [values, save] as const;
}
