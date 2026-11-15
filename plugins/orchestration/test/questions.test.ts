import { test } from "node:test";
import assert from "node:assert/strict";
import { answerLines, chosenAnswers, optionOf, questionKey, recommendedOf, splitQuestions, validReply } from "../src/questions.ts";
import { quickReplyTitles, replyDraft } from "../src/reply.ts";
import type { Ask } from "../src/view.ts";

const ask = (key: string, title: string, options: string[], kind: Ask["kind"] = "owner"): Ask => ({
  key, who: "T1", subtask: "T1", age: "", since: null, title, replyTitle: title, text: "", links: [], threads: [], kind,
  replies: options.map((label) => ({ label, draft: replyDraft(title, label) })), drafts: { primary: `Re «${title}»: ` }, answered: null,
});

test("the recommended suffix becomes a mark; other options stay as written", () => {
  assert.deepEqual(optionOf("Table draws (recommended)"), { text: "Table draws", mark: "Recommended" });
  assert.deepEqual(optionOf("Do not show (recommended by the plan)"), { text: "Do not show", mark: "Recommended by the plan" });
  assert.deepEqual(optionOf("Hide it as «Story 3 — hidden»"), { text: "Hide it as «Story 3 — hidden»", mark: null });
  assert.equal(recommendedOf(ask("a", "A", ["No", "Yes (recommended)"])), "Yes (recommended)");
  assert.equal(recommendedOf(ask("a", "A", ["Approved", "Changes needed"])), null);
});

test("two or more pickable asks share a card; a lone one, a decision or an ask without options stays a card", () => {
  const a = ask("a", "A", ["Yes", "No"]);
  const b = ask("b", "B", ["One", "Two"]);
  const open = ask("c", "C", []);
  const decision = ask("d", "D", ["Land"], "decision");
  assert.deepEqual(splitQuestions([a, open, b, decision]), { questions: [a, b], rest: [open, decision] });
  assert.deepEqual(splitQuestions([a, open]), { questions: [], rest: [a, open] });
});

test("one card question per title: the newer of two lines with the same title; the older one is not a card either", () => {
  const old = ask("a", "A", ["Yes", "No"]);
  const b = ask("b", "B", ["One", "Two"]);
  const newer = ask("c", "A", ["Yes", "No", "Later"]);
  assert.deepEqual(splitQuestions([old, b, newer]), { questions: [b, newer], rest: [] });
});

test("recommended options are preselected only for questions present when the card opened", () => {
  const a = ask("owner-0", "T1: A", ["Yes (recommended)", "No"]);
  const b = ask("owner-1", "T1: B", ["One", "Two (recommended)"]);
  const opened = new Set([questionKey(a)]);
  assert.deepEqual(chosenAnswers([a, b], {}, opened), { [questionKey(a)]: "Yes (recommended)" }, "a question that arrived later starts unpicked");
});

test("a cleared pick stays cleared, and a pick follows its question when ledger lines shift", () => {
  const a = ask("owner-0", "T1: A", ["Yes (recommended)", "No"]);
  const b = ask("owner-1", "T1: B", ["Yes", "No"]);
  const opened = new Set([questionKey(a), questionKey(b)]);
  const picks = { [questionKey(a)]: "", [questionKey(b)]: "No" };
  assert.deepEqual(chosenAnswers([a, b], picks, opened), { [questionKey(b)]: "No" });
  const shiftedB = { ...b, key: "owner-0" };
  assert.deepEqual(chosenAnswers([shiftedB], { [questionKey(a)]: "Yes", [questionKey(b)]: "No" }, opened), { [questionKey(b)]: "No" }, "A's pick never lands on B");
});

test("the message has one Re line per chosen question, in card order", () => {
  const a = ask("a", "T1: A «x»", ["Yes (recommended)", "No"]);
  const c = ask("c", "T1: C", ["Approved", "Changes needed"]);
  const lines = answerLines([a, c], { [questionKey(c)]: "Approved", [questionKey(a)]: "Yes (recommended)" });
  assert.deepEqual(lines.map((l) => l.line), ["Re «T1: A «x»»: Yes (recommended)", "Re «T1: C»: Approved"]);
  assert.deepEqual(answerLines([a], {}), []);
});

test("the server sends a reply only when every line is a current quick reply and no question repeats", () => {
  const quick = quickReplyTitles(["ask: A | options: Yes / No", "ask: B «x» y | options: One", "ask: Plan»: one | options: Go", "ask: Plan»: two | options: Go"]);
  assert.equal(validReply(replyDraft("A", "Yes"), quick), true);
  assert.equal(validReply(`${replyDraft("A", "Yes")}\n${replyDraft("B «x» y", "One")}`, quick), true);
  assert.equal(validReply(`${replyDraft("Plan»: one", "Go")}\n${replyDraft("Plan»: two", "Go")}`, quick), true, "titles sharing a prefix are different questions");
  assert.equal(validReply(`${replyDraft("A", "Yes")}\n${replyDraft("A", "No")}`, quick), false, "two answers to one question");
  assert.equal(validReply(`${replyDraft("A", "Yes")}\nRe «C»: go`, quick), false, "a line the ledger no longer offers");
  assert.equal(validReply(`${replyDraft("A", "Yes")}\r\n${replyDraft("B «x» y", "One")}`, quick), false, "CRLF");
  assert.equal(validReply("", quick), false);
});
