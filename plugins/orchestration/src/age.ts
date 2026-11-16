export function shortAge(ms: number): string {
  if (ms < 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Like {@link shortAge} but counts seconds: a running step is seconds old. */
export function stepAge(ms: number): string {
  return ms < 60_000 ? `${Math.max(0, Math.floor(ms / 1000))}s` : shortAge(ms);
}
