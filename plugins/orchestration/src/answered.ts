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

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" ? (value as Json) : {});

/** Pages back through `client/turn/requested` events, newest first, until enough of them are the owner's. */
export async function collectOwnerMessages(
  list: (beforeSeq: string | undefined) => Promise<readonly unknown[]>,
  { want, pageSize, pages }: { want: number; pageSize: number; pages: number },
): Promise<OwnerMessage[]> {
  const messages: OwnerMessage[] = [];
  let beforeSeq: string | undefined;
  for (let page = 0; page < pages && messages.length < want; page++) {
    const events = await list(beforeSeq);
    for (const event of events) {
      const data = obj(obj(event).data);
      if (data.initiator !== "user") continue;
      const text = (Array.isArray(data.input) ? data.input : []).map((part) => obj(part).text).filter((t) => typeof t === "string").join("\n");
      const at = obj(event).createdAt;
      if (text && typeof at === "number") messages.push({ text, at });
    }
    const oldest = obj(events.at(-1)).seq;
    if (events.length < pageSize || (typeof oldest !== "number" && typeof oldest !== "string")) break;
    beforeSeq = String(oldest);
  }
  return messages;
}

export interface Observation {
  observedAt: number;
  /** «For the owner» line → when it was first observed. */
  firstSeen: Record<string, number>;
}

/** A line absent at the previous observation appeared after it; a ledger never observed before dates its lines from 0. */
export function observe(previous: Observation | null, lines: readonly string[], now: number): Observation {
  const firstSeen: Record<string, number> = {};
  for (const line of lines) firstSeen[line] = previous ? previous.firstSeen[line] ?? previous.observedAt : 0;
  return { observedAt: now, firstSeen };
}

export function sameLines(a: Observation | null, b: Observation): boolean {
  if (!a) return false;
  const keys = Object.keys(b.firstSeen);
  return keys.length === Object.keys(a.firstSeen).length && keys.every((k) => a.firstSeen[k] === b.firstSeen[k]);
}

/** A title on two lines takes the newer line. */
export function askFirstSeen(lines: readonly string[], firstSeen: Record<string, number>, ledgerStatus: string | null = null): Record<string, number> {
  const byTitle: Record<string, number> = {};
  for (const line of lines) {
    const item = parseOwnerItem(line, ledgerStatus);
    if (item.kind === "ask") byTitle[item.title] = Math.max(byTitle[item.title] ?? 0, firstSeen[line] ?? 0);
  }
  return byTitle;
}

const keepNewer = (found: Record<string, Answer>, title: string, answer: Answer) => {
  if (!found[title] || found[title]!.at < answer.at) found[title] = answer;
};

/** What a Generative UI form writes for a field left empty. */
const FORM_UNANSWERED = "—";

/** One message may answer several asks, one `Re «title»: …` per line. */
export function answeredAsks(since: Record<string, number>, messages: readonly OwnerMessage[]): Record<string, Answer> {
  const found: Record<string, Answer> = {};
  const prefixes = Object.keys(since).map((title) => [title, replyPrefix(title).trimEnd()] as const);
  for (const { text, at } of messages) {
    for (const segment of text.trim().split(/\n(?=Re «)/)) {
      for (const [title, prefix] of prefixes) {
        if (at < since[title]! || !segment.startsWith(prefix)) continue;
        const answer = segment.slice(prefix.length).trim();
        if (answer && answer !== FORM_UNANSWERED) keepNewer(found, title, { answer, at });
      }
    }
  }
  return found;
}

/** A quick reply this client remembers counts only for an ask line that was already there when it was sent. */
export function combineAnswers(server: Record<string, Answer>, local: Record<string, Answer>, since: Record<string, number>): Record<string, Answer> {
  const found = { ...server };
  for (const [title, answer] of Object.entries(local)) {
    if (title in since && answer.at >= since[title]!) keepNewer(found, title, answer);
  }
  return found;
}

export function answeredStatus({ answer, at }: Answer, now: number): string {
  const age = shortAge(now - at);
  const short = answer.length > 60 ? `${answer.slice(0, 59).trimEnd()}…` : answer;
  return `Answered «${short}» ${age === "now" ? "just now" : `${age} ago`} · waiting for the orchestrator`;
}
