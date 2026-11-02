import type { Artifact, ListView } from "./contract";

export type Source = "claude" | "codex";
export type Found = { item: Artifact; source: Source };

export function urlKey(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    return `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function findByUrl(view: ListView, raw: string): Found | null {
  const key = urlKey(raw);
  if (key === null) return null;
  for (const source of ["claude", "codex"] as const) {
    const item = view[source].items.find((candidate) => urlKey(candidate.url) === key);
    if (item) return { item, source };
  }
  return null;
}
