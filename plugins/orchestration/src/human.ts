// The human view's words: status words, role nouns, times, names, and the cleanup of orchestrator-written text (docs/human-view.md §3).

export const STATUS_WORDS: Record<string, string> = {
  planned: "Not started",
  "waiting-dependency": "Not started",
  card: "Waits for you to start it",
  briefed: "Starting",
  working: "In progress",
  question: "Has a question for you",
  blocked: "Blocked",
  delivered: "Ready for checks",
  gate: "Being checked",
  ready: "Ready to land, waits for your OK",
  landed: "Landed",
  verified: "Done",
  dropped: "Dropped",
};

export const ROLE_NOUNS: Record<string, string> = {
  researcher: "Research",
  designer: "Design",
  planner: "Plan",
  implementer: "Build",
  reviewer: "Review",
  runner: "Run",
};

/** The plain word for a status cell; `blocked` and `gate` carry their cause or stage. */
export function statusWord(status: string | null, detail: string | null = null): string {
  const word = status ? STATUS_WORDS[status] : undefined;
  if (!word) return status ? capitalize(status) : "Status unknown";
  if (status === "blocked" && detail) return `Blocked: ${detail}`;
  if (status === "gate" && detail) return `Being checked: ${detail}`;
  return word;
}

export function roleNoun(role: string | null | undefined): string | null {
  return role ? ROLE_NOUNS[role.toLowerCase()] ?? null : null;
}

export const partTitle = (noun: string | null, name: string) => (noun ? `${noun} · ${name}` : name);

export const capitalize = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1) : text);

/** `bb-plugins feature/team-roles-design (local …)` → «Team roles design»: a delivery's branch or file stem. */
export function deliveryName(delivery: string | null | undefined): string | null {
  if (!delivery) return null;
  const bare = delivery.replace(/\([^)]*\)?/g, " ");
  const path = bare.split(/\s+/).find((word) => word.includes("/") && !/^https?:/.test(word));
  if (!path) return /^(?:PR\b|review\b|report\b)|#\d|\b[0-9a-f]{7,40}\b/i.test(delivery) || !/[a-z]{3,}\s+[a-z]{2,}/i.test(delivery) ? null : clampWords(capitalize(bare.trim()));
  const stem = (path.replace(/\/+$/, "").split("/").pop() ?? "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/^(?:RV-)?[A-Z]{1,4}\d+[a-z]?[-_]/, "");
  const words = stem.replace(/[-_]+/g, " ").trim();
  return words ? capitalize(words) : null;
}

/** The first eight words of a name, with an ellipsis when cut. */
export function clampWords(text: string, words = 8): string {
  const parts = text.trim().split(/\s+/);
  return parts.length > words ? `${parts.slice(0, words).join(" ")}…` : text.trim();
}

export const NAME_MAX = 40;
const NAME_SLACK = 5;

/** A name for titles: one over NAME_MAX + NAME_SLACK characters is cut at a word within NAME_MAX, with an ellipsis. */
export function capName(text: string, max = NAME_MAX): string {
  const plain = text.trim();
  if (plain.length <= max + NAME_SLACK) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:·—–-]+$/, "")}…`;
}

/** `[orchestrate slug #64] V1: build the view as designed.` → «Build the view as designed», the brief's first line after `<id>:`. */
export function briefName(message: string | null | undefined, id?: string | null): string | null {
  const sentence = briefSentence(message, id);
  return sentence ? clampWords(sentence) : null;
}

/** The brief's whole first sentence after `<id>:`, unclamped: a Plan step's description. */
export function briefSentence(message: string | null | undefined, id?: string | null): string | null {
  const first = message?.split("\n").find((line) => line.trim())?.trim().replace(/^\[orchestrate [^\]]*\]\s*/, "") ?? "";
  const match = /^((?:RV-)?[A-Z]{1,4}\d+[a-z]?)(?:\s*#\d+)?(?:\s*\([^)]*\))?\s*:\s*(.+)$/.exec(first);
  if (!match || (id && match[1] !== id)) return null;
  const sentence = match[2]!.split(/(?<=[.!?])\s/)[0]!.replace(/[.!?]+$/, "").trim();
  return sentence ? capitalize(sentence) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayStart = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();
/** A ledger time this far past the clock is skew, not a rounding of «now». */
export const FUTURE_SKEW_MS = 2 * 60_000;

/** «just now», «12 min», «2 h 5 min», «yesterday 14:05», «Mon 14:05», «9 Nov»; a time later than now shows as its clock time. */
export function when(at: number, now: number): string {
  const date = new Date(at);
  if (at - now > FUTURE_SKEW_MS) return dayStart(at) === dayStart(now) ? clock(date) : `${date.getDate()} ${MONTHS[date.getMonth()]} ${clock(date)}`;
  const ms = Math.max(0, now - at);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
  if (days <= 1) return `yesterday ${clock(date)}`;
  if (days < 7) return `${DAYS[date.getDay()]} ${clock(date)}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** {@link when} for running text: a past age reads «12 min ago». */
export function whenInText(at: number, now: number): string {
  const label = when(at, now);
  return /\d (?:min|h)$/.test(label) ? `${label} ago` : label;
}

const ISO_TIME = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;

/** The parseable time an ISO stamp in free text names; «+0300» offsets included. */
export function parseLedgerTime(text: string): number | null {
  const iso = text.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
}

export interface CleanContext {
  /** A subtask id's display name; null when the id is not a subtask of this ledger. */
  name(id: string): string | null;
  /** A reviewer id's part name, when it reviews a part. */
  reviewed?(id: string): string | null;
  /** A bb thread's title. */
  threadTitle?(threadId: string): string | null;
  now: number;
}

const SUBTASK_ID = /(?<![\w«-])((?:RV-)?[A-Z]{1,4}\d+[a-z]?)(?![\w»-])/g;

/** Rewrites ids, SHAs, message numbers, thread ids, gate ids and times into names and plain words; never rewrites meaning. */
export function cleanText(text: string | null | undefined, ctx: CleanContext): string {
  if (!text) return "";
  let out = text.replace(/\s*\(host clock\)/gi, "");
  out = out.replace(/(?<![\w/])thr_[a-z0-9]+\b(?!\/)/gi, (id) => ctx.threadTitle?.(id) ?? "");
  out = out.replace(ISO_TIME, (stamp) => {
    const at = parseLedgerTime(stamp);
    return at === null ? stamp : stamp.includes("T") ? whenInText(at, ctx.now) : stamp;
  });
  out = out.replace(/\backs?\s+#\d+(?:\s*,\s*#\d+)*/gi, "");
  out = out.replace(/(?<![\w/])#\d+(?:\s*(?:,|and|&|[–-])\s*#?\d+)+\b/g, "");
  out = out.replace(/(?<!\bPR\s?)(?<![\w/])#\d+\s*\(([^)]+)\)/g, "$1");
  out = out.replace(/\s+(?:without|for|with|to|of|in|on)\s+(?<![\w/])#\d+\b(?=\s*(?:[;,.)]|$))/gim, "");
  out = out.replace(/(?<!\bPR\s?)(?<![\w/])#\d+\b/g, "");
  out = out.replace(/\s+(?=['’]s\b)/g, "");
  out = out.replace(/\bff[- ]push(?:ed)?\b/gi, "");
  out = out.replace(/@?\b[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}\b/gi, "");
  out = out.replace(/\s+(?:on top of|on|at|onto) @?(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gi, "");
  out = out.replace(/@?\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gi, "");
  out = out.replace(/@(?=\s|[,;)]|$)/g, "");
  out = out.replace(/(?<![\w/$.-])r(\d+)(?![\w./-])/g, "round $1");
  out = out.replace(/(\b[Gg]ates?\s+)?\bG-((?:RV-)?[A-Z]{1,4}\d+[a-z]?)\b/g, (whole, gate: string | undefined, id: string) => {
    const name = ctx.name(id);
    return name ? `${gate && /^G/.test(gate) ? "The" : "the"} «${name}» checks` : whole;
  });
  out = out.replace(SUBTASK_ID, (id: string) => {
    const part = ctx.reviewed?.(id);
    if (part) return `review of «${part}»`;
    const name = ctx.name(id);
    return name && name !== id ? `«${name}»` : id;
  });
  out = owner(out);
  out = out.replace(/\b(?:waiting on|blocked by|doing|next|since|for|updated|why|basis):\s+/gi, "");
  return tidy(out);
}

/** «owner confirms» → «you confirm», «the owner's» → «your». */
function owner(text: string): string {
  return text
    .replace(/\b(?:the )?owner's\b/gi, (whole) => cased(whole, "your"))
    .replace(/\b(?:the )?owner\b(?![-\w'])(?:(\s+)([a-z]+))?/gi, (whole, space: string | undefined, word: string | undefined) => {
      if (word && !isVerb(word)) return whole;
      const you = cased(whole, "you");
      return word ? `${you}${space}${presentPlural(word)}` : you;
    });
}

const AUXILIARY = new Set(["to", "is", "has", "was", "will", "can", "must", "should", "may", "might", "would", "could", "did", "does", "do", "said", "sent", "told", "wants", "needs", "saw", "chose", "gave", "made", "took", "found", "left"]);
const OWNER_NOUNS = new Set(["list", "lines", "asks", "notes", "section", "table", "rows", "decisions", "answers", "questions", "items"]);
/** «owner confirms» is the owner acting; «owner list» is a noun phrase and stays. */
const isVerb = (word: string) => AUXILIARY.has(word.toLowerCase()) || (!OWNER_NOUNS.has(word.toLowerCase()) && /(?:s|ed)$/i.test(word));

const cased = (source: string, word: string) => (/^[A-Z]/.test(source) ? capitalize(word) : word);

function presentPlural(verb: string): string {
  if (/^(?:is)$/.test(verb)) return "are";
  if (/^(?:has)$/.test(verb)) return "have";
  if (/^(?:was)$/.test(verb)) return "were";
  if (verb.length > 3 && /[^aeiou]ies$/.test(verb)) return `${verb.slice(0, -3)}y`;
  if (verb.length > 3 && /(?:ches|shes|sses|xes)$/.test(verb)) return verb.slice(0, -2);
  if (verb.length > 3 && /[^su]s$/.test(verb)) return verb.slice(0, -1);
  return verb;
}

/** Drops what the cleanup left behind: empty brackets, doubled separators, stray spaces. */
function tidy(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/\(\s*[,;:·]?\s*\)/g, "")
      .replace(/\(\s*[,;]\s*/g, "(")
      .replace(/\s*[,;]\s*\)/g, ")")
      .replace(/([,;])\s*(?=[,;])/g, "")
      .replace(/\s+([,;:.)])/g, "$1")
      .replace(/\(\s+/g, "(")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/^[\s,;:—–-]+/, "")
      .replace(/[\s,;:—–-]+$/, "");
  }
  return out.trim();
}

const BOOKKEEPING = /^(?:(?:RV-)?[A-Z]{1,4}\d+[a-z]?(?:\s*#\d+)?\s+)?(?:acked|acks?\b|archived?\b|archiving|closed\b|took over|takeover|taking over|rotated|rotation|rotate\b|notification level|ledger budget|journal rows?)/i;

/** Journal rows that only record acks, archiving, takeovers, rotations, notification levels or the ledger budget. */
export function isBookkeeping(decision: string): boolean {
  return BOOKKEEPING.test(decision.trim());
}
