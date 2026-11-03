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

/** Current thread first, then by `urgency` if given, then most recently visited, then most recently updated. */
export function orderThreads<T extends SwitchableThread>(
  threads: readonly T[],
  recent: readonly string[],
  currentId: string | null,
  limit: number,
  urgency?: (thread: T) => number,
): T[] {
  const visible = threads.filter((thread) => !thread.isArchived && !thread.isHidden);
  const rank = new Map<string, number>();
  recent.forEach((id, index) => rank.set(id, index));
  if (currentId) rank.set(currentId, -1);
  return [...visible]
    .sort((a, b) => {
      if (urgency && a.id !== currentId && b.id !== currentId) {
        const difference = urgency(a) - urgency(b);
        if (difference !== 0) return difference;
      }
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

export interface ThreadPreview {
  messages: PreviewMessage[];
  /** What the thread is waiting on: a question, an approval or a form. */
  pending: string | null;
  /** The step a running thread is on, such as "Running npm test". */
  activity: string | null;
}

export const EMPTY_PREVIEW: ThreadPreview = { messages: [], pending: null, activity: null };

const MAX_PREVIEW_MESSAGES = 6;
const MAX_MESSAGE_CHARS = 600;
const MAX_ACTIVITY_CHARS = 160;

interface RowLike {
  kind?: unknown;
  role?: unknown;
  id?: unknown;
  text?: unknown;
  initiator?: unknown;
  children?: unknown;
  workKind?: unknown;
  lifecycle?: unknown;
  questions?: unknown;
  title?: unknown;
  target?: unknown;
  command?: unknown;
  toolName?: unknown;
  toolArgs?: unknown;
  status?: unknown;
  change?: unknown;
  path?: unknown;
  query?: unknown;
  queries?: unknown;
  url?: unknown;
  description?: unknown;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function flatten(rows: unknown, out: RowLike[]): RowLike[] {
  if (!Array.isArray(rows)) return out;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as RowLike;
    out.push(row);
    flatten(row.children, out);
  }
  return out;
}

function toMessage(row: RowLike, index: number): PreviewMessage | null {
  if (row.kind !== "conversation" || (row.role !== "user" && row.role !== "assistant")) return null;
  if (row.role === "user" && row.initiator === "system") return null;
  const text = typeof row.text === "string" ? cleanText(row.text) : "";
  if (text === "") return null;
  return {
    id: typeof row.id === "string" ? row.id : String(index),
    role: row.role,
    text: clip(text, MAX_MESSAGE_CHARS),
  };
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

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function describeTarget(row: RowLike | undefined): string | null {
  if (!row) return null;
  const args = row.toolArgs && typeof row.toolArgs === "object" ? (row.toolArgs as Record<string, unknown>) : {};
  return str(row.command) ?? str(args.command) ?? str(args.description) ?? str(args.file_path) ?? str(row.toolName);
}

function describePending(row: RowLike, byId: Map<unknown, RowLike>): string | null {
  if (row.kind !== "work") return null;
  if (row.workKind === "question" && (row.lifecycle === "pending" || row.lifecycle === "resolving")) {
    const prompts = Array.isArray(row.questions)
      ? row.questions.map((question) => str((question as { prompt?: unknown } | null)?.prompt)).filter(Boolean)
      : [];
    return prompts.length > 0 ? prompts.join("\n\n") : "Asks a question";
  }
  if (row.workKind === "form" && row.lifecycle === "pending") return str(row.title) ?? "Waits for a form";
  if (row.workKind === "approval" && (row.lifecycle === "waiting" || row.lifecycle === "pending")) {
    const target = row.target as { itemId?: unknown; toolName?: unknown } | null;
    const what = describeTarget(byId.get(target?.itemId)) ?? str(target?.toolName);
    return what ? `Approve: ${what}` : "Waits for an approval";
  }
  return null;
}

function fileName(path: string | null): string | null {
  return path ? (path.split("/").filter(Boolean).pop() ?? path) : null;
}

function shortCommand(command: string): string {
  return command.split("\n")[0]!.replace(/^(cd\s+\S+\s*&&\s*)+/, "").trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

const INTERACTION_KINDS = new Set(["question", "approval", "form"]);

export function describeActivity(row: RowLike): string | null {
  if (row.kind !== "work" || row.status !== "pending" || INTERACTION_KINDS.has(row.workKind as string)) return null;
  const args = row.toolArgs && typeof row.toolArgs === "object" ? (row.toolArgs as Record<string, unknown>) : {};
  switch (row.workKind) {
    case "command": {
      const command = str(row.command);
      return command ? `Running ${shortCommand(command)}` : "Running a command";
    }
    case "file-change": {
      const name = fileName(str((row.change as { path?: unknown } | null)?.path));
      return name ? `Editing ${name}` : "Editing files";
    }
    case "file-read": {
      const name = fileName(str(row.path));
      return name ? `Reading ${name}` : "Reading files";
    }
    case "search": {
      const query = str(row.query);
      return query ? `Searching for ${query}` : "Searching the code";
    }
    case "web-search": {
      const query = Array.isArray(row.queries) ? str(row.queries[0]) : null;
      return query ? `Searching the web for ${query}` : "Searching the web";
    }
    case "web-fetch": {
      const url = str(row.url);
      return url ? `Reading ${hostOf(url)}` : "Reading a web page";
    }
    case "delegation":
      return `Subagent: ${str(row.description) ?? "working"}`;
    case "workflow":
      return str(row.description) ? `Workflow: ${str(row.description)}` : "Running a workflow";
    case "image-generation":
      return "Generating an image";
    case "tool": {
      const detail = str(args.description) ?? str(args.command);
      const tool = str(row.toolName)?.split("__").pop() ?? "a tool";
      return detail ? `${tool}: ${shortCommand(detail)}` : `Running ${tool}`;
    }
    default:
      return null;
  }
}

export function previewFromTimeline(timeline: unknown): ThreadPreview {
  if (!timeline || typeof timeline !== "object") return EMPTY_PREVIEW;
  const rows = flatten((timeline as { rows?: unknown }).rows, []);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const messages: PreviewMessage[] = [];
  let pending: string | null = null;
  let activity: string | null = null;
  rows.forEach((row, index) => {
    const message = toMessage(row, index);
    if (message) messages.push(message);
    pending = describePending(row, byId) ?? pending;
    activity = describeActivity(row) ?? activity;
  });
  return {
    messages: messages.slice(-MAX_PREVIEW_MESSAGES),
    pending: pending && clip(pending, MAX_MESSAGE_CHARS),
    activity: activity && clip(activity, MAX_ACTIVITY_CHARS),
  };
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
