import { test } from "node:test";
import assert from "node:assert/strict";
import { answersMessage, optionOf, recommendedOf, splitQuestions, validReply } from "../src/questions.ts";
import { replyDraft } from "../src/reply.ts";
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

test("the message has one Re line per picked question, in card order, and skips unpicked or stale picks", () => {
  const a = ask("a", "T1: A «x»", ["Yes (recommended)", "No"]);
  const b = ask("b", "T1: B", ["One", "Two"]);
  const c = ask("c", "T1: C", ["Approved", "Changes needed"]);
  assert.equal(answersMessage([a, b, c], { c: "Approved", a: "Yes (recommended)", b: "Gone" }), "Re «T1: A «x»»: Yes (recommended)\nRe «T1: C»: Approved");
  assert.equal(answersMessage([a], {}), "");
});

test("the server sends a reply only when every line is a current quick reply and no question repeats", () => {
  const quick = [replyDraft("A", "Yes"), replyDraft("A", "No"), replyDraft("B «x» y", "One")];
  assert.equal(validReply(replyDraft("A", "Yes"), quick), true);
  assert.equal(validReply(`${replyDraft("A", "Yes")}\n${replyDraft("B «x» y", "One")}`, quick), true);
  assert.equal(validReply(`${replyDraft("A", "Yes")}\n${replyDraft("A", "No")}`, quick), false, "two answers to one question");
  assert.equal(validReply(`${replyDraft("A", "Yes")}\nRe «C»: go`, quick), false, "a line the ledger no longer offers");
  assert.equal(validReply("", quick), false);
});
