import { shortAge } from "./age.ts";
import { parseOwnerItem } from "./owner.ts";
import { replyPrefix } from "./reply.ts";

export interface OwnerMessage {
  text: string;
  at: number;
}

export interface Answer {
  answer: string;
  at: number;
}

/** When each «For the owner» line was first seen. A ledger seen for the first time has no history, so its lines date from 0. */
export function trackFirstSeen(previous: Record<string, number> | null, lines: readonly string[], seenAt: number): Record<string, number> {
  const next: Record<string, number> = {};
  for (const line of lines) next[line] = previous ? previous[line] ?? seenAt : 0;
  return next;
}

export function sameFirstSeen(a: Record<string, number> | null, b: Record<string, number>): boolean {
  if (!a) return false;
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}

/** Ask title → the owner's newest `Re «title»: …` sent after that ask line appeared. */
export function answeredAsks(lines: readonly string[], firstSeen: Record<string, number>, messages: readonly OwnerMessage[]): Record<string, Answer> {
  const found: Record<string, Answer> = {};
  for (const line of lines) {
    const item = parseOwnerItem(line);
    if (item.kind !== "ask") continue;
    const prefix = replyPrefix(item.title).trimEnd();
    const since = firstSeen[line] ?? 0;
    for (const { text, at } of messages) {
      const trimmed = text.trim();
      if (at < since || !trimmed.startsWith(prefix)) continue;
      const answer = trimmed.slice(prefix.length).trim();
      if (answer && (!found[item.title] || found[item.title]!.at < at)) found[item.title] = { answer, at };
    }
  }
  return found;
}

/** The newer answer per title wins, wherever it was seen. */
export function mergeAnswers(...sources: Record<string, Answer>[]): Record<string, Answer> {
  const merged: Record<string, Answer> = {};
  for (const source of sources) {
    for (const [title, answer] of Object.entries(source)) if (!merged[title] || merged[title]!.at < answer.at) merged[title] = answer;
  }
  return merged;
}

export function answeredStatus({ answer, at }: Answer, now: number): string {
  const age = shortAge(now - at);
  const short = answer.length > 60 ? `${answer.slice(0, 59).trimEnd()}…` : answer;
  return `Answered «${short}» ${age === "now" ? "just now" : `${age} ago`} · waiting for the orchestrator`;
}
