// One «For the owner» item, as the orchestrate export hands it over (bullet stripped, continuation lines joined).
export interface Link {
  label: string;
  href: string;
}

export type OwnerItem =
  | { kind: "ask"; title: string; why: string | null; links: Link[]; threads: string[]; options: string[] }
  | { kind: "note"; text: string }
  | { kind: "free"; text: string; links: Link[]; threads: string[] };

const URL = /https?:\/\/[^\s<>()|]+[^\s<>()|.,;:!?'"»]/g;
const GITHUB_REF = /(?<![\w./-])([A-Za-z0-9][\w.-]*\/[\w.-]+)#(\d+)\b/g;
const GITHUB_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:pull|issues)\/(\d+)/;
const THREAD = /\bthr_[a-z0-9]+\b/gi;

function urlLabel(href: string): string {
  const gh = GITHUB_URL.exec(href);
  if (gh) return `${gh[1]}#${gh[2]}`;
  const bare = href.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return bare.length > 48 ? `${bare.slice(0, 47)}…` : bare;
}

export function linksIn(text: string): Link[] {
  const found: (Link & { at: number })[] = [];
  for (const m of text.matchAll(URL)) found.push({ label: urlLabel(m[0]), href: m[0], at: m.index });
  const withoutUrls = text.replace(URL, (url) => " ".repeat(url.length));
  for (const m of withoutUrls.matchAll(GITHUB_REF)) found.push({ label: `${m[1]}#${m[2]}`, href: `https://github.com/${m[1]}/pull/${m[2]}`, at: m.index });
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .filter((l) => !seen.has(l.label) && !!seen.add(l.label))
    .map(({ label, href }) => ({ label, href }));
}

const threadsIn = (text: string) => [...new Set(text.match(THREAD) ?? [])];

function parseAsk(text: string): OwnerItem | null {
  const [head = "", ...rest] = text.split(/\s+\|\s+/);
  const title = head.replace(/^ask:/i, "").trim();
  if (!title) return null;
  const fields: Record<string, string[]> = {};
  for (const segment of rest) {
    const match = /^([a-z]+):\s*(.*)$/i.exec(segment.trim());
    if (match) (fields[match[1]!.toLowerCase()] ??= []).push(match[2]!.trim());
  }
  const all = (...keys: string[]) => keys.flatMap((k) => fields[k] ?? []);
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
  if (/^nothing\b/i.test(text)) return { kind: "note", text };
  if (/^ask:/i.test(text)) {
    const ask = parseAsk(text);
    if (ask) return ask;
  }
  return { kind: "free", text, links: linksIn(text), threads: threadsIn(text) };
}
