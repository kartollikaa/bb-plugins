import { isThreadId } from "./route.ts";

export function knownOwner(threadId: string, roots: ReadonlySet<string> | null, parents: ReadonlyMap<string, string | null>): string | null | undefined {
  if (!roots) return undefined;
  const seen = new Set<string>();
  let current: string | null = threadId;
  while (current && isThreadId(current) && !seen.has(current) && seen.size < 100) {
    if (roots.has(current)) return current;
    seen.add(current);
    if (!parents.has(current)) return undefined;
    current = parents.get(current)!;
  }
  return current === null ? null : undefined;
}

export function threadLink(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.origin !== new URL(base).origin || url.search || url.hash) return null;
    return /^\/projects\/proj_[a-z0-9]+\/threads\/(thr_[a-z0-9]+)\/?$/i.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function plainClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }, target: string, download: boolean): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented && (!target || target === "_self") && !download;
}

export interface NavigationOptions {
  enabled(threadId: string): boolean;
  owner(threadId: string): string | null | undefined;
  resolve(threadId: string): Promise<string | null>;
  location(): string;
  openView(owner: string, threadId: string): void;
  openChat(threadId: string): void;
}

export function createOwnerCache(now = Date.now) {
  const recent = new Map<string, { owner: string | null; at: number }>();
  return {
    get(threadId: string): string | null | undefined {
      const cached = recent.get(threadId);
      return cached && now() - cached.at < 5_000 ? cached.owner : undefined;
    },
    set(threadId: string, owner: string | null) {
      recent.delete(threadId);
      recent.set(threadId, { owner, at: now() });
      if (recent.size > 64) recent.delete(recent.keys().next().value!);
    },
  };
}
export const navigationOwners = createOwnerCache();

export function createThreadNavigation(options: NavigationOptions, recent = createOwnerCache()) {
  let generation = 0;
  const pending = new Map<string, Promise<string | null>>();
  function resolve(threadId: string) {
    const cached = recent.get(threadId);
    if (cached !== undefined) return Promise.resolve(cached);
    const existing = pending.get(threadId);
    if (existing) return existing;
    const request = options.resolve(threadId).then((owner) => {
      recent.set(threadId, owner);
      return owner;
    });
    pending.set(threadId, request);
    void request.finally(() => pending.delete(threadId)).catch(() => {});
    return request;
  }
  return {
    cancel() { generation++; },
    preload(threadId: string) {
      if (options.enabled(threadId) && options.owner(threadId) === undefined) void resolve(threadId).catch(() => {});
    },
    open(threadId: string, afterEvent = false): boolean {
      const token = ++generation;
      if (!options.enabled(threadId)) return false;
      const owner = options.owner(threadId);
      if (owner === null) return false;
      const source = options.location();
      const finish = (action: () => void) => {
        const guarded = () => { if (token === generation && source === options.location()) action(); };
        if (afterEvent) setTimeout(guarded, 0);
        else guarded();
      };
      if (owner !== undefined) {
        finish(() => { if (options.enabled(threadId)) options.openView(owner, threadId); });
        return true;
      }
      void resolve(threadId).catch(() => null).then((resolved) => finish(() => {
        if (resolved && options.enabled(threadId)) options.openView(resolved, threadId);
        else options.openChat(threadId);
      }));
      return true;
    },
  };
}
