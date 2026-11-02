import type { Artifact, ListView, SourceList } from "./contract";

const MAX_ROWS = 100;

function row(item: Artifact): string {
  const date = item.updatedAt?.slice(0, 10) ?? "";
  return [date.padEnd(10), item.title.slice(0, 70).padEnd(70), item.url, item.detail ? `(${item.detail})` : ""].join("  ").trimEnd();
}

function section(name: string, list: SourceList): string[] {
  const lines = [`${name}:`];
  if (list.error) lines.push(`  ! ${list.error}`);
  const rows = list.items;
  if (rows.length === 0 && !list.error) lines.push("  nothing published yet");
  lines.push(...rows.slice(0, MAX_ROWS).map((item) => `  ${row(item)}`));
  if (rows.length > MAX_ROWS) lines.push(`  … ${rows.length - MAX_ROWS} more (use --json)`);
  return lines;
}

export function formatList(view: ListView): string {
  return [...section("Claude Code artifacts", view.claude), "", ...section("Codex Sites", view.codex)].join("\n");
}

/** "3 h ago", "2 d ago", or the date for anything older than a month. */
export function relativeTime(iso: string | null, now = Date.now()): string {
  if (iso === null) return "";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days <= 30) return `${days} d ago`;
  return new Date(at).toISOString().slice(0, 10);
}
