export const MAX_RECENT = 50;
export const DEFAULT_THREAD_COUNT = 6;
export const MIN_THREAD_COUNT = 2;
export const MAX_THREAD_COUNT = 20;

export function clampThreadCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_THREAD_COUNT;
  return Math.min(MAX_THREAD_COUNT, Math.max(MIN_THREAD_COUNT, Math.round(value)));
}

export function recordVisit(recent: readonly string[], threadId: string): string[] {
  return [threadId, ...recent.filter((id) => id !== threadId)].slice(0, MAX_RECENT);
}

export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((id): id is string => typeof id === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export interface SwitchableThread {
  id: string;
  updatedAt: number;
  isArchived: boolean;
  isHidden: boolean;
}

/** Current thread first, then most recently visited, then most recently updated. */
export function orderThreads<T extends SwitchableThread>(
  threads: readonly T[],
  recent: readonly string[],
  currentId: string | null,
  limit: number,
): T[] {
  const visible = threads.filter((thread) => !thread.isArchived && !thread.isHidden);
  const rank = new Map<string, number>();
  recent.forEach((id, index) => rank.set(id, index));
  if (currentId) rank.set(currentId, -1);
  return [...visible]
    .sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, limit);
}

export function stepIndex(index: number, delta: number, count: number): number {
  if (count === 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/** The first press selects the previous thread, as an app switcher does. */
export function initialIndex(direction: "forward" | "backward", count: number, hasCurrent: boolean): number {
  if (count <= 1) return 0;
  if (direction === "backward") return count - 1;
  return hasCurrent ? 1 : 0;
}

export interface PreviewMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const MAX_PREVIEW_MESSAGES = 6;
const MAX_MESSAGE_CHARS = 600;

interface RowLike {
  kind?: unknown;
  role?: unknown;
  id?: unknown;
  text?: unknown;
  initiator?: unknown;
  children?: unknown;
}

function collectConversation(rows: unknown, out: PreviewMessage[]): void {
  if (!Array.isArray(rows)) return;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as RowLike;
    if (row.kind === "conversation" && (row.role === "user" || row.role === "assistant")) {
      if (row.role === "user" && row.initiator === "system") continue;
      const text = typeof row.text === "string" ? cleanText(row.text) : "";
      if (text === "") continue;
      out.push({
        id: typeof row.id === "string" ? row.id : String(out.length),
        role: row.role,
        text: text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}…` : text,
      });
    }
    collectConversation(row.children, out);
  }
}

export function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/<[^>\n]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]{1,3}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function previewFromTimeline(timeline: unknown): PreviewMessage[] {
  if (!timeline || typeof timeline !== "object") return [];
  const out: PreviewMessage[] = [];
  collectConversation((timeline as { rows?: unknown }).rows, out);
  return out.slice(-MAX_PREVIEW_MESSAGES);
}

export function formatAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}
