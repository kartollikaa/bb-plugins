import type { Artifact } from "./contract";

export function matches(item: Artifact, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${item.title} ${item.description ?? ""} ${item.url}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
