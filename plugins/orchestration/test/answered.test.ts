import { test } from "node:test";
import assert from "node:assert/strict";
import { answeredAsks, answeredStatus, askFirstSeen, collectOwnerMessages, combineAnswers, observe, sameLines } from "../src/answered.ts";

const ASK = "ask: Remove orchestration bits from thread-tree? | options: keep both (recommended) / remove";
const TITLE = "Remove orchestration bits from thread-tree?";

test("a ledger observed for the first time dates its lines from 0; a later new line dates from the previous observation", () => {
  const first = observe(null, [ASK], 500);
  assert.deepEqual(first, { observedAt: 500, firstSeen: { [ASK]: 0 } });
  const next = observe(first, [ASK, "ask: Merge #12"], 900);
  assert.deepEqual(next.firstSeen, { [ASK]: 0, "ask: Merge #12": 500 }, "not 900: the line may have been written right after 500");
  assert.deepEqual(observe(next, ["ask: Merge #12"], 1000).firstSeen, { "ask: Merge #12": 500 }, "a gone line is forgotten");
  assert.equal(sameLines(next, observe(next, [ASK, "ask: Merge #12"], 2000)), true);
  assert.equal(sameLines(first, next), false);
  assert.equal(sameLines(null, first), false);
});

test("an answer sent before a later observation still counts when the line stayed", () => {
  const seen = observe(observe(null, [], 100), [ASK], 300);
  assert.equal(seen.firstSeen[ASK], 100);
  const since = askFirstSeen([ASK], observe(seen, [ASK], 900).firstSeen);
  assert.deepEqual(Object.keys(answeredAsks(since, [{ text: `Re «${TITLE}»: keep both`, at: 200 }])), [TITLE]);
});

test("ask first-seen goes by title, only for ask lines, newer line wins", () => {
  const since = askFirstSeen([ASK, `note: ${TITLE}`, `ask: ${TITLE} | why: again`], { [ASK]: 10, [`ask: ${TITLE} | why: again`]: 50 });
  assert.deepEqual(since, { [TITLE]: 50 });
});

test("the owner's «Re «title»: answer» answers the ask, the quick reply and a typed one alike", () => {
  const since = { [TITLE]: 0 };
  assert.deepEqual(answeredAsks(since, [{ text: `Re «${TITLE}»: keep both (recommended)`, at: 100 }]), { [TITLE]: { answer: "keep both (recommended)", at: 100 } });
  assert.equal(answeredAsks(since, [{ text: `Re «${TITLE}»: keep both, but drop the tab\nand say why`, at: 120 }])[TITLE]!.answer, "keep both, but drop the tab\nand say why");
});

test("one message answers several asks, one Re line each", () => {
  const found = answeredAsks({ A: 0, B: 0 }, [{ text: "Re «A»: yes\nRe «B»: no, later", at: 5 }]);
  assert.deepEqual(found, { A: { answer: "yes", at: 5 }, B: { answer: "no, later", at: 5 } });
});

test("a Generative UI form's answers block, labels «Re «title»», answers every ask, with a note typed above it", () => {
  const nested = "T1: Show «Banes N · Boons M» on the briefings";
  const text = `Looks good, one change below.\n\nRe «T1: Who draws Threat cards»: Table draws, Imperial player records which came out\nRe «${nested}»: Show the counts\nRe «T1: Review the plan folder»: Approved`;
  const found = answeredAsks({ "T1: Who draws Threat cards": 0, [nested]: 0, "T1: Review the plan folder": 0 }, [{ text, at: 9 }]);
  assert.deepEqual(found, {
    "T1: Who draws Threat cards": { answer: "Table draws, Imperial player records which came out", at: 9 },
    [nested]: { answer: "Show the counts", at: 9 },
    "T1: Review the plan folder": { answer: "Approved", at: 9 },
  });
});

test("a form field left empty comes back as «—» and leaves its ask open", () => {
  const found = answeredAsks({ A: 0, B: 0 }, [{ text: "Re «A»: Approved\nRe «B»: —", at: 4 }]);
  assert.deepEqual(found, { A: { answer: "Approved", at: 4 } });
});

test("not an answer: an empty draft, another title, or a reply sent before the line appeared", () => {
  assert.deepEqual(answeredAsks({ [TITLE]: 0 }, [{ text: `Re «${TITLE}»:`, at: 100 }]), {});
  assert.deepEqual(answeredAsks({ [TITLE]: 0 }, [{ text: "Re «Merge #12»: go", at: 100 }]), {});
  assert.deepEqual(answeredAsks({ [TITLE]: 200 }, [{ text: `Re «${TITLE}»: keep both`, at: 100 }]), {}, "a re-asked line waits for a new answer");
  assert.deepEqual(Object.keys(answeredAsks({ [TITLE]: 200 }, [{ text: `Re «${TITLE}»: keep both`, at: 300 }])), [TITLE]);
});

test("a remembered quick reply doesn't answer a re-ask of the same title", () => {
  const local = { [TITLE]: { answer: "keep both", at: 100 } };
  assert.deepEqual(combineAnswers({}, local, { [TITLE]: 0 }), local, "positive control: the original ask is answered");
  assert.deepEqual(combineAnswers({}, local, { [TITLE]: 200 }), {}, "re-asked after the reply");
  assert.deepEqual(combineAnswers({}, local, {}), {}, "the ask left the ledger");
});

test("the newest answer wins, across messages and across sources", () => {
  const found = answeredAsks({ [TITLE]: 0 }, [{ text: `Re «${TITLE}»: remove`, at: 300 }, { text: `Re «${TITLE}»: keep both`, at: 100 }]);
  assert.equal(found[TITLE]!.answer, "remove");
  const since = { [TITLE]: 0, other: 0 };
  const merged = combineAnswers({ [TITLE]: { answer: "server", at: 100 } }, { [TITLE]: { answer: "local", at: 200 }, other: { answer: "x", at: 1 } }, since);
  assert.deepEqual(merged, { [TITLE]: { answer: "local", at: 200 }, other: { answer: "x", at: 1 } });
  assert.equal(combineAnswers({ [TITLE]: { answer: "server", at: 300 } }, { [TITLE]: { answer: "local", at: 200 } }, since)[TITLE]!.answer, "server");
});

test("the answered card says what was answered and that the orchestrator has it", () => {
  assert.equal(answeredStatus({ answer: "keep both", at: 0 }, 5 * 60_000), "Answered «keep both» 5m ago · waiting for the orchestrator");
  assert.equal(answeredStatus({ answer: "x".repeat(80), at: 0 }, 0), `Answered «${"x".repeat(59)}…» just now · waiting for the orchestrator`);
});

test("owner messages are paged for past agent and system tells, and stop once enough are found", async () => {
  const event = (seq: number, initiator: string, text: string) => ({ seq, createdAt: seq * 10, data: { initiator, input: [{ type: "text", text }] } });
  const all = [event(1, "user", "Re «A»: yes"), ...Array.from({ length: 250 }, (_, i) => event(i + 2, i % 2 ? "agent" : "system", "tell"))].reverse();
  const calls: (string | undefined)[] = [];
  const list = async (beforeSeq: string | undefined) => {
    calls.push(beforeSeq);
    const from = beforeSeq ? all.findIndex((e) => e.seq < Number(beforeSeq)) : 0;
    return all.slice(from, from + 100);
  };
  const found = await collectOwnerMessages(list, { want: 5, pageSize: 100, pages: 5 });
  assert.deepEqual(found, [{ text: "Re «A»: yes", at: 10 }], "the owner's answer is on the third page");
  assert.deepEqual(calls, [undefined, "152", "52"]);
  const one = await collectOwnerMessages(list, { want: 5, pageSize: 100, pages: 1 });
  assert.deepEqual(one, [], "positive control: one page of tells hides it");
});
