export type LinkKind = "pull-request" | "issue" | "commit" | "repository" | "kaiten" | "buildin" | "figma" | "web";

export interface ThreadLink {
  url: string;
  kind: LinkKind;
  label: string;
  host: string;
  github: { owner: string; repo: string; number: number } | null;
  firstSeq: number;
  lastSeq: number;
  mentions: number;
}

export interface TextSource {
  seq: number;
  text: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`\\\]]+/g;
const MARKDOWN_LINK = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g;
const TRAILING_PUNCTUATION = /[.,;:!?*_~]+$/;

/** Cuts the punctuation and unbalanced closing brackets prose leaves after a URL. */
export function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING_PUNCTUATION, "");
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]] as const) {
    while (url.endsWith(close) && count(url, close) > count(url, open)) {
      url = url.slice(0, -1).replace(TRAILING_PUNCTUATION, "");
    }
  }
  return url;
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** Drops the fragment and tracking noise so the same page mentioned twice is one link. */
export function canonicalUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.hostname === "") return null;
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith("utm_")) parsed.searchParams.delete(key);
  }
  if (parsed.hostname === "github.com") {
    const pr = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (pr) return `https://github.com/${pr[1]}/${pr[2]}/pull/${pr[3]}`;
  }
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

export function extractUrls(text: string): { url: string; text: string | null }[] {
  const found: { url: string; text: string | null }[] = [];
  const titled = new Map<string, string>();
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const label = match[1]!.trim();
    if (label !== "" && !/^https?:\/\//.test(label)) titled.set(trimUrl(match[2]!), label);
  }
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0]);
    found.push({ url, text: titled.get(url) ?? null });
  }
  return found;
}

export function classify(url: string): Pick<ThreadLink, "kind" | "label" | "host" | "github"> {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean).map(safeDecode);
  if (host === "github.com" && segments.length >= 2) {
    const [owner, repo, section, id] = segments as [string, string, string?, string?];
    const number = id !== undefined && /^\d+$/.test(id) ? Number(id) : null;
    if (section === "pull" && number !== null) {
      return { kind: "pull-request", label: `${repo} #${number}`, host, github: { owner, repo, number } };
    }
    if (section === "issues" && number !== null) {
      return { kind: "issue", label: `${repo} #${number}`, host, github: { owner, repo, number } };
    }
    if (section === "commit" && id !== undefined) {
      return { kind: "commit", label: `${repo}@${id.slice(0, 7)}`, host, github: null };
    }
    const rest = segments.slice(2).join("/");
    return { kind: "repository", label: rest === "" ? `${owner}/${repo}` : `${repo}/${rest}`, host, github: null };
  }
  if (host.endsWith("kaiten.ru") || host.endsWith("kaiten.io")) {
    const card = segments.find((segment) => /^\d{4,}$/.test(segment));
    return { kind: "kaiten", label: card ? `Kaiten ${card}` : `Kaiten ${segments.join("/")}`.trim(), host, github: null };
  }
  if (host.endsWith("buildin.ai")) {
    return { kind: "buildin", label: `Buildin ${shortTail(segments)}`.trim(), host, github: null };
  }
  if (host.endsWith("figma.com")) {
    const name = segments[2] ?? segments[1] ?? "";
    return { kind: "figma", label: `Figma ${name.replace(/-/g, " ")}`.trim(), host, github: null };
  }
  const tail = shortTail(segments);
  return { kind: "web", label: tail === "" ? host : `${host}/${tail}`, host, github: null };
}

function shortTail(segments: string[]): string {
  const tail = segments.slice(-2).join("/");
  return tail.length > 48 ? `…${tail.slice(-47)}` : tail;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Folds message texts, oldest first, into one entry per distinct link. */
export function collectLinks(sources: Iterable<TextSource>, into = new Map<string, ThreadLink>()): Map<string, ThreadLink> {
  for (const { seq, text } of sources) {
    for (const { url: raw, text: title } of extractUrls(text)) {
      const url = canonicalUrl(raw);
      if (url === null) continue;
      const existing = into.get(url);
      if (existing) {
        existing.lastSeq = Math.max(existing.lastSeq, seq);
        existing.mentions += 1;
        if (title !== null && existing.kind === "web") existing.label = title;
        continue;
      }
      const facts = classify(url);
      into.set(url, {
        url,
        ...facts,
        label: title !== null && facts.kind === "web" ? title : facts.label,
        firstSeq: seq,
        lastSeq: seq,
        mentions: 1,
      });
    }
  }
  return into;
}

const KIND_ORDER: LinkKind[] = ["pull-request", "issue", "kaiten", "buildin", "figma", "commit", "repository", "web"];

/** Pull requests first, then trackers and docs; the latest mention leads inside a kind. */
export function sortLinks(links: Iterable<ThreadLink>): ThreadLink[] {
  return [...links].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.lastSeq - a.lastSeq,
  );
}
