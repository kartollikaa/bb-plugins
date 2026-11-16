// One «For the owner» item, as the orchestrate export hands it over (bullet stripped, continuation lines joined).
export interface Link {
  /** Short button text: `repo#N` for GitHub, host and path otherwise. */
  label: string;
  title: string;
  href: string;
}

export type OwnerItem =
  | { kind: "ask"; format: "ask" | "free text"; title: string; why: string | null; links: Link[]; threads: string[]; options: string[] }
  | { kind: "note"; text: string; freeText?: true };

const URL = /https?:\/\/[^\s<>()|]+[^\s<>()|.,;:!?'"»]/g;
const GITHUB_REF = /(?<![\w./-])([A-Za-z0-9][\w.-]*)\/([\w.-]+)#(\d+)\b/g;
const GITHUB_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)(\/[^?#]*)?/;
const THREAD = /\bthr_[a-z0-9]+\b/gi;
const ASK_KEYS = new Set(["why", "link", "links", "thread", "threads", "option", "options"]);

function urlLink(href: string): Link {
  const gh = GITHUB_URL.exec(href);
  if (gh) return { label: `${gh[2]}#${gh[3]}${(gh[4] ?? "").replace(/\/$/, "")}`, title: `${gh[1]}/${gh[2]}#${gh[3]}${gh[4] ?? ""}`, href };
  const bare = href.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return { label: bare.length > 48 ? `${bare.slice(0, 47)}…` : bare, title: href, href };
}

export function linksIn(text: string): Link[] {
  const found: (Link & { at: number })[] = [];
  for (const m of text.matchAll(URL)) found.push({ ...urlLink(m[0]), at: m.index });
  const withoutUrls = text.replace(URL, (url) => " ".repeat(url.length));
  for (const m of withoutUrls.matchAll(GITHUB_REF)) {
    found.push({ label: `${m[2]}#${m[3]}`, title: `${m[1]}/${m[2]}#${m[3]}`, href: `https://github.com/${m[1]}/${m[2]}/pull/${m[3]}`, at: m.index });
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .filter((l) => !seen.has(l.href) && !!seen.add(l.href))
    .map(({ label, title, href }) => ({ label, title, href }));
}

const threadsIn = (text: string) => [...new Set(text.match(THREAD) ?? [])];

// Orchestrators editing the ledger by hand drift into `Q (asked 2026-11-16): …` and `question: …`; `Q (answered …)` stays a record.
const ASK_PREFIX = /^(?:ask:|(?:q|question)\s*(?:\(asked\b[^)]*\))?\s*:)/i;

function parseAsk(text: string): OwnerItem | null {
  const fields: [string, string][] = [["ask", ""]];
  for (const segment of text.replace(ASK_PREFIX, "").split(/\s+\|\s+/)) {
    const match = /^([a-z]+):\s*(.*)$/i.exec(segment.trim());
    const key = match?.[1]!.toLowerCase();
    if (match && key && ASK_KEYS.has(key)) fields.push([key, match[2]!.trim()]);
    else {
      const last = fields[fields.length - 1]!;
      last[1] = last[1] ? `${last[1]} | ${segment.trim()}` : segment.trim();
    }
  }
  const title = fields[0]![1];
  if (!title) return null;
  const all = (...keys: string[]) => fields.filter(([k]) => keys.includes(k)).map(([, v]) => v);
  return {
    kind: "ask",
    format: "ask",
    title,
    why: all("why").join(" ") || null,
    links: linksIn(all("link", "links").join(" ")),
    threads: threadsIn(all("thread", "threads").join(" ")),
    options: all("options", "option").flatMap((v) => v.split(/\s+\/\s+/)).map((o) => o.trim()).filter(Boolean),
  };
}

/** Lines that are a record or say that nothing waits: never a wait on the owner. */
const NOTHING_LINE = new Set(["nothing", "«nothing»", "nothing pending", "ничего", "none", "—"]);
const NOT_A_WAIT = /^(?:note:|answered\b|q\s*\(answered\b[^)]*\)\s*:|ask\s*\(draft\)\s*:|nothing\s*(?:waiting|waits|for\s*the\s*owner)|quiet:|ничего\s+не\s+ждёт)/i;

/**
 * The ledger schema has only `ask:` and `note:`. Besides the hand-written `Q:` forms, a line that is no record and does not say
 * that nothing waits is a wait on the owner written as free text, unless the ledger is closed.
 */
export function parseOwnerItem(raw: string, ledgerStatus: string | null = null): OwnerItem {
  const text = raw.trim();
  const note = (): OwnerItem => ({ kind: "note", text: text.replace(/^note:\s*/i, "") });
  if (NOT_A_WAIT.test(text) || NOTHING_LINE.has(text.toLowerCase().replace(/\.+$/, ""))) return note();
  if (ASK_PREFIX.test(text)) return parseAsk(text) ?? note();
  if (!text) return note();
  if (ledgerStatus === "closed") return { kind: "note", text, freeText: true };
  return { kind: "ask", format: "free text", title: text, why: null, links: linksIn(text), threads: threadsIn(text), options: [] };
}
