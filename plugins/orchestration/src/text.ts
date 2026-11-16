import type { Subtask } from "./contract.ts";

/** The first line of a subtask's report, from the orchestrate protocol. */
export const REPORT_HEADER = /^\[orchestrate [^\]]+\]\s+(\S+)\s+(working|question|blocked|delivered|updated|rotate):\s*(.*)$/;

/** What a message says in words: without fenced blocks (```ui cards, code) and bb directive lines (`::browser-preview{…}`). */
export function spokenText(text: string): string {
  return text
    .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "")
    .replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*$/m, "")
    .split("\n")
    .filter((line) => !/^\s*::[\w-]+/.test(line))
    .map((line) => line.replace(/::[\w-]+\{[^}]*\}/g, ""))
    .join("\n");
}

export function firstLine(text: string | null, max = 140): string | null {
  if (!text) return null;
  for (const raw of spokenText(text).split("\n")) {
    const line = raw
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*(#+|[-*>]|\d+\.)\s*/, "")
      .replace(/[*`]/g, "")
      .replace(/(^|\s)_+(?=\S)|(?<=\S)_+(?=\s|$)/g, "$1")
      .trim();
    if (line) return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
  }
  return null;
}

/** The kind and gist of a subtask report whose first line is the protocol header. */
export function reportGist(output: string | null): { kind: string; gist: string } | null {
  const first = output?.split("\n").find((line) => line.trim())?.trim();
  const match = first ? REPORT_HEADER.exec(first) : null;
  return match ? { kind: match[2]!, gist: match[3]!.trim() } : null;
}

/** The first eight words of a name, with an ellipsis when cut. */
export function shortName(text: string | null, words = 8): string | null {
  const line = firstLine(text, 200);
  if (!line) return null;
  const parts = line.split(/\s+/);
  return parts.length > words ? `${parts.slice(0, words).join(" ")}…` : line;
}

/** «ready — plan verified; waits on review» → «plan verified; waits on review»: what the orchestrator wrote after the status word. */
export function statusNote(subtask: Pick<Subtask, "status" | "statusRaw">, max = 90): string | null {
  const word = subtask.status ?? "";
  const rest = subtask.statusRaw?.trim().toLowerCase().startsWith(word.toLowerCase()) ? subtask.statusRaw.trim().slice(word.length) : subtask.statusRaw;
  return firstLine(rest?.replace(/^[\s:;,—–-]+/, "") ?? null, max);
}
