import { parseOwnerItem } from "./owner.ts";
import { shortAge } from "./age.ts";
import type { PreferenceStorage } from "./route.ts";

export type Delivery = "sent" | "queued";
/** `already`: the same text went to the same thread seconds ago, so this call sent nothing. */
export type Outcome = Delivery | "already";

/** bb's queue: a reply waits behind the orchestrator's running turn instead of steering into it. */
export const REPLY_MODE = "queue-if-active";
const DAY_MS = 24 * 60 * 60_000;

export const replyPrefix = (title: string): string => `Re «${title}»: `;
export const replyDraft = (title: string, option: string): string => `${replyPrefix(title)}${option}`;
export const replyKey = (title: string, options: readonly string[]): string => JSON.stringify([title, ...options]);

/** Newer bb reports `deferred` for a send a plugin wait holds; it is accepted, like a queued one. */
export const toDelivery = (raw: string): Delivery => (raw === "sent" ? "sent" : "queued");

export function quickReplies(forTheOwner: readonly string[]): string[] {
  return forTheOwner.flatMap((line) => {
    const item = parseOwnerItem(line);
    return item.kind === "ask" ? item.options.map((option) => replyDraft(item.title, option)) : [];
  });
}

export function replySender(
  send: (threadId: string, text: string) => Promise<Delivery>,
  { windowMs, now }: { windowMs: number; now: () => number },
): (threadId: string, text: string) => Promise<Outcome> {
  const recent = new Map<string, { at: number | null; result: Promise<Delivery> }>();
  return async (threadId, text) => {
    const key = JSON.stringify([threadId, text]);
    for (const [k, v] of recent) if (v.at !== null && now() - v.at > windowMs) recent.delete(k);
    const seen = recent.get(key);
    if (seen) {
      await seen.result;
      return "already";
    }
    const entry: { at: number | null; result: Promise<Delivery> } = { at: null, result: send(threadId, text) };
    recent.set(key, entry);
    try {
      const delivery = await entry.result;
      entry.at = now();
      return delivery;
    } catch (error) {
      recent.delete(key);
      throw error;
    }
  };
}

export type ReplyState = { kind: "sending"; option: string } | { kind: "sent"; option: string; delivery: Outcome; at: number };
type Entry = { kind: "sending" | "sent"; option: string; delivery?: Outcome; token: number; at: number };

export function replyStatus(state: ReplyState, now: number): string {
  if (state.kind === "sending") return `Sending «${state.option}»…`;
  const age = shortAge(now - state.at);
  const when = age === "now" ? "just now" : `${age} ago`;
  if (state.delivery === "already") return `«${state.option}» was already sent · ${when}`;
  if (state.delivery === "queued") return `Sent «${state.option}», queued behind the orchestrator's turn · ${when}`;
  return `Sent «${state.option}» · ${when}`;
}

const STORAGE_KEY = "orchestration.sentReplies.v1";
type Saved = Record<string, Record<string, { option: string; delivery: Outcome; at: number }>>;

export function createReplyTracker(
  storage: PreferenceStorage | null = null,
  { now = Date.now, maxAgeMs = 7 * DAY_MS }: { now?: () => number; maxAgeMs?: number } = {},
) {
  const states = new Map<string, Map<string, Entry>>();
  const listeners = new Set<() => void>();
  let version = 0;
  let nextToken = 1;

  const save = () => {
    const saved: Saved = {};
    for (const [threadId, asks] of states) {
      for (const [ask, entry] of asks) {
        if (entry.kind === "sent" && entry.delivery) (saved[threadId] ??= {})[ask] = { option: entry.option, delivery: entry.delivery, at: entry.at };
      }
    }
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {}
  };
  const emit = () => {
    version++;
    save();
    listeners.forEach((l) => l());
  };
  const of = (threadId: string) => {
    let m = states.get(threadId);
    if (!m) states.set(threadId, (m = new Map()));
    return m;
  };

  let expired = false;
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}") as Saved;
    for (const [threadId, asks] of Object.entries(saved)) {
      for (const [ask, { option, delivery, at }] of Object.entries(asks)) {
        if (typeof at === "number" && now() - at <= maxAgeMs) of(threadId).set(ask, { kind: "sent", option, delivery, at, token: 0 });
        else expired = true;
      }
    }
  } catch {
    states.clear();
  }
  if (expired) save();

  const view = (entry: Entry | undefined): ReplyState | null => {
    if (!entry) return null;
    return entry.kind === "sending" ? { kind: "sending", option: entry.option } : { kind: "sent", option: entry.option, delivery: entry.delivery ?? "sent", at: entry.at };
  };
  const current = (threadId: string, ask: string, token: number) => {
    const entry = states.get(threadId)?.get(ask);
    return entry?.kind === "sending" && entry.token === token ? entry : null;
  };

  return {
    version: () => version,
    get: (threadId: string, ask: string): ReplyState | null => view(states.get(threadId)?.get(ask)),
    begin(threadId: string, ask: string, option: string): number | null {
      const m = of(threadId);
      if (m.has(ask)) return null;
      const token = nextToken++;
      m.set(ask, { kind: "sending", option, token, at: now() });
      emit();
      return token;
    },
    again(threadId: string, ask: string, option: string): number | null {
      if (states.get(threadId)?.get(ask)?.kind !== "sent") return null;
      const token = nextToken++;
      of(threadId).set(ask, { kind: "sending", option, token, at: now() });
      emit();
      return token;
    },
    done(threadId: string, ask: string, token: number, delivery: Outcome) {
      const entry = current(threadId, ask, token);
      if (!entry) return;
      of(threadId).set(ask, { kind: "sent", option: entry.option, delivery, token, at: now() });
      emit();
    },
    fail(threadId: string, ask: string, token: number) {
      if (current(threadId, ask, token) && states.get(threadId)?.delete(ask)) emit();
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
