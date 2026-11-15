export function reportOf(output: string | null | undefined): { text: string; truncated: boolean } | null {
  const text = output?.trim();
  if (!text) return null;
  const characters = Array.from(text);
  return { text: characters.slice(0, 16_000).join(""), truncated: characters.length > 16_000 };
}
