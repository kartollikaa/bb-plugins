import type { Ask } from "./view.ts";
import { replyDraft, replyKey } from "./reply.ts";

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
  const byTitle = new Map<string, Ask>();
  for (const a of asks) if (a.kind === "owner" && a.replyTitle && a.replies.length > 0) byTitle.set(a.replyTitle, a);
  const pickable = asks.filter((a) => a.replyTitle && byTitle.get(a.replyTitle) === a);
  if (pickable.length < 2) return { questions: [], rest: [...asks] };
  const titles = new Set(pickable.map((a) => a.replyTitle));
  return { questions: pickable, rest: asks.filter((a) => !titles.has(a.replyTitle)) };
}

/** A question's identity across ledger rewrites: its title and options, never its line position. */
export const questionKey = (q: Ask): string => replyKey(q.replyTitle ?? "", q.replies.map((r) => r.label));

/**
 * The option each question sends. The owner's pick wins; `""` is a pick they cleared. Otherwise the
 * recommended option, but only for questions the owner saw when the card opened.
 */
export function chosenAnswers(questions: readonly Ask[], picks: Readonly<Record<string, string>>, preselect: ReadonlySet<string>): Record<string, string> {
  const chosen: Record<string, string> = {};
  for (const q of questions) {
    const key = questionKey(q);
    const pick = key in picks ? picks[key] : preselect.has(key) ? recommendedOf(q) : null;
    if (pick && q.replies.some((r) => r.label === pick)) chosen[key] = pick;
  }
  return chosen;
}

/** One `Re «title»: option` line per chosen question, in card order. */
export function answerLines(questions: readonly Ask[], chosen: Readonly<Record<string, string>>): { key: string; label: string; line: string }[] {
  return questions.flatMap((q) => {
    const key = questionKey(q);
    const label = chosen[key];
    return label ? [{ key, label, line: replyDraft(q.replyTitle!, label) }] : [];
  });
}

/** A reply the server sends: every line one of the ledger's quick replies (draft → its ask's title), no title twice. */
export function validReply(text: string, quick: ReadonlyMap<string, string>): boolean {
  const titles = text.split("\n").map((line) => quick.get(line));
  if (titles.some((title) => title === undefined)) return false;
  return new Set(titles).size === titles.length;
}
