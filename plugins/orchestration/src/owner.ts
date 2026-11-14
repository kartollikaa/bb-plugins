// One «For the owner» item, as the orchestrate export hands it over (bullet stripped, continuation lines joined).
export interface Link {
  /** Short button text: `repo#N` for GitHub, host and path otherwise. */
  label: string;
  title: string;
  href: string;
}

export type OwnerItem =
  | { kind: "ask"; title: string; why: string | null; links: Link[]; threads: string[]; options: string[] }
  | { kind: "note"; text: string }
  | { kind: "free"; text: string; links: Link[]; threads: string[] };

const URL = /https?:\/\/[^\s<>()|]+[^\s<>()|.,;:!?'"»]/g;
const GITHUB_REF = /(?<![\w./-])([A-Za-z0-9][\w.-]*)\/([\w.-]+)#(\d+)\b/g;
const GITHUB_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)$/;
const THREAD = /\bthr_[a-z0-9]+\b/gi;
/** «Nothing», «Nothing waiting.», «Nothing waits on owner input.» — but not «Nothing lands until you approve». */
const NOTHING_STATUS = /^nothing(?:\s+(?:waiting|pending|to ask|left|(?:needs|waits on|for)\s+(?:you|the owner|owner)(?:\s+input)?))?\s*(?:[.;:!—–-]|$)/i;
const ASK_KEYS = new Set(["why", "link", "links", "thread", "threads", "option", "options"]);

function urlLink(href: string): Link {
  const gh = GITHUB_URL.exec(href);
  if (gh) return { label: `${gh[2]}#${gh[3]}`, title: `${gh[1]}/${gh[2]}#${gh[3]}`, href };
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

function parseAsk(text: string): OwnerItem | null {
  const fields: [string, string][] = [["ask", ""]];
  for (const segment of text.replace(/^ask:/i, "").split(/\s+\|\s+/)) {
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
    title,
    why: all("why").join(" ") || null,
    links: linksIn(all("link", "links").join(" ")),
    threads: threadsIn(all("thread", "threads").join(" ")),
    options: all("options", "option").flatMap((v) => v.split(/\s+\/\s+/)).map((o) => o.trim()).filter(Boolean),
  };
}

export function parseOwnerItem(raw: string): OwnerItem {
  const text = raw.trim();
  if (/^note:/i.test(text)) return { kind: "note", text: text.replace(/^note:\s*/i, "") };
  if (NOTHING_STATUS.test(text)) return { kind: "note", text };
  if (/^ask:/i.test(text)) {
    const ask = parseAsk(text);
    if (ask) return ask;
  }
  return { kind: "free", text, links: linksIn(text), threads: threadsIn(text) };
}
