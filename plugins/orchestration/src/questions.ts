import type { Ask } from "./view.ts";
import { replyDraft } from "./reply.ts";

const RECOMMENDED = /\s*\((recommended[^)]*)\)\s*$/i;

/** An option as the card shows it: the ledger's «(recommended …)» suffix becomes a mark. */
export function optionOf(label: string): { text: string; mark: string | null } {
  const m = label.match(RECOMMENDED);
  if (!m) return { text: label, mark: null };
  const mark = m[1]!.trim();
  return { text: label.slice(0, m.index).trim() || label, mark: mark.charAt(0).toUpperCase() + mark.slice(1) };
}

export function recommendedOf(ask: Ask): string | null {
  return ask.replies.find((r) => RECOMMENDED.test(r.label))?.label ?? null;
}

/** Asks the owner answers by picking an option; two or more of them share one card. */
export function splitQuestions(asks: readonly Ask[]): { questions: Ask[]; rest: Ask[] } {
  const pickable = asks.filter((a) => a.kind === "owner" && a.replyTitle && a.replies.length > 0);
  if (pickable.length < 2) return { questions: [], rest: [...asks] };
  const keys = new Set(pickable.map((a) => a.key));
  return { questions: pickable, rest: asks.filter((a) => !keys.has(a.key)) };
}

/** One message, one `Re «title»: option` line per picked question, in card order. */
export function answersMessage(questions: readonly Ask[], picks: Readonly<Record<string, string>>): string {
  return questions.flatMap((q) => {
    const label = picks[q.key];
    return label && q.replies.some((r) => r.label === label) ? [replyDraft(q.replyTitle!, label)] : [];
  }).join("\n");
}

/** A reply the server sends: every line one of the ledger's quick replies, no title twice. */
export function validReply(text: string, quick: readonly string[]): boolean {
  const lines = text.split("\n");
  if (!lines.length || lines.some((line) => !quick.includes(line))) return false;
  const titles = lines.map((line) => line.slice(0, line.indexOf("»: ")));
  return new Set(titles).size === titles.length;
}
