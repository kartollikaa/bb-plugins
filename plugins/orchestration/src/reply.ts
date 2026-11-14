import { parseOwnerItem } from "./owner.ts";

export type Delivery = "sent" | "queued";

/** bb's queue: a reply waits behind the orchestrator's running turn instead of steering into it. */
export const REPLY_MODE = "queue-if-active";

export const replyPrefix = (title: string): string => `Re «${title}»: `;
export const replyDraft = (title: string, option: string): string => `${replyPrefix(title)}${option}`;

export function quickReplies(forTheOwner: readonly string[]): string[] {
  return forTheOwner.flatMap((line) => {
    const item = parseOwnerItem(line);
    return item.kind === "ask" ? item.options.map((option) => replyDraft(item.title, option)) : [];
  });
}

/** Sends a reply once: a repeat while it is in flight, or within `windowMs` of success, gets the first result. */
export function replySender(
  send: (threadId: string, text: string) => Promise<Delivery>,
  { windowMs, now }: { windowMs: number; now: () => number },
): (threadId: string, text: string) => Promise<Delivery> {
  const recent = new Map<string, { at: number | null; result: Promise<Delivery> }>();
  return (threadId, text) => {
    const key = `${threadId}\u0000${text}`;
    const seen = recent.get(key);
    if (seen && (seen.at === null || now() - seen.at <= windowMs)) return seen.result;
    for (const [k, v] of recent) if (v.at !== null && now() - v.at > windowMs) recent.delete(k);
    const entry: { at: number | null; result: Promise<Delivery> } = { at: null, result: Promise.resolve("sent") };
    entry.result = send(threadId, text).then(
      (delivery) => {
        entry.at = now();
        return delivery;
      },
      (error: unknown) => {
        recent.delete(key);
        throw error;
      },
    );
    recent.set(key, entry);
    return entry.result;
  };
}

export type ReplyState = { kind: "sending"; option: string } | { kind: "sent"; option: string; delivery: Delivery };

/** Per orchestrator thread and ask: one click in flight, and the sent state until the ledger drops the ask. */
export function createReplyTracker() {
  const states = new Map<string, Map<string, ReplyState>>();
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => {
    version++;
    listeners.forEach((l) => l());
  };
  const of = (threadId: string) => {
    let m = states.get(threadId);
    if (!m) states.set(threadId, (m = new Map()));
    return m;
  };
  return {
    /** Changes on every update, for useSyncExternalStore. */
    version: () => version,
    get: (threadId: string, ask: string): ReplyState | null => states.get(threadId)?.get(ask) ?? null,
    begin(threadId: string, ask: string, option: string): boolean {
      const m = of(threadId);
      if (m.has(ask)) return false;
      m.set(ask, { kind: "sending", option });
      emit();
      return true;
    },
    done(threadId: string, ask: string, delivery: Delivery) {
      const current = states.get(threadId)?.get(ask);
      if (!current) return;
      of(threadId).set(ask, { kind: "sent", option: current.option, delivery });
      emit();
    },
    fail(threadId: string, ask: string) {
      if (states.get(threadId)?.delete(ask)) emit();
    },
    prune(threadId: string, liveAsks: readonly string[]) {
      const m = states.get(threadId);
      if (!m) return;
      const live = new Set(liveAsks);
      let changed = false;
      for (const ask of m.keys()) if (!live.has(ask)) changed = m.delete(ask) || changed;
      if (changed) emit();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
