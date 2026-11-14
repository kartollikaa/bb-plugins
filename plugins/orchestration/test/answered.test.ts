import { test } from "node:test";
import assert from "node:assert/strict";
import { answeredAsks, answeredStatus, mergeAnswers, sameFirstSeen, trackFirstSeen } from "../src/answered.ts";

const ASK = "ask: Remove orchestration bits from thread-tree? | options: keep both (recommended) / remove";
const TITLE = "Remove orchestration bits from thread-tree?";

test("a ledger seen for the first time dates its lines from 0; later new lines date from when they were seen", () => {
  const first = trackFirstSeen(null, [ASK], 500);
  assert.deepEqual(first, { [ASK]: 0 });
  const next = trackFirstSeen(first, [ASK, "ask: Merge #12"], 900);
  assert.deepEqual(next, { [ASK]: 0, "ask: Merge #12": 900 });
  assert.deepEqual(trackFirstSeen(next, ["ask: Merge #12"], 1000), { "ask: Merge #12": 900 }, "a gone line is forgotten");
  assert.equal(sameFirstSeen(next, { ...next }), true);
  assert.equal(sameFirstSeen(first, next), false);
  assert.equal(sameFirstSeen(null, {}), false);
});

test("the owner's «Re «title»: answer» answers the ask, the quick reply and a typed one alike", () => {
  const messages = [{ text: `Re «${TITLE}»: keep both (recommended)`, at: 100 }];
  assert.deepEqual(answeredAsks([ASK], { [ASK]: 0 }, messages), { [TITLE]: { answer: "keep both (recommended)", at: 100 } });
  const typed = [{ text: `Re «${TITLE}»: keep both, but drop the tab\nand say why`, at: 120 }];
  assert.equal(answeredAsks([ASK], { [ASK]: 0 }, typed)[TITLE]!.answer, "keep both, but drop the tab\nand say why");
});

test("not an answer: an empty draft, another title, a note line, or a reply sent before the line appeared", () => {
  assert.deepEqual(answeredAsks([ASK], { [ASK]: 0 }, [{ text: `Re «${TITLE}»:`, at: 100 }]), {});
  assert.deepEqual(answeredAsks([ASK], { [ASK]: 0 }, [{ text: "Re «Merge #12»: go", at: 100 }]), {});
  assert.deepEqual(answeredAsks([`note: ${TITLE}`], {}, [{ text: `Re «${TITLE}»: go`, at: 100 }]), {});
  assert.deepEqual(answeredAsks([ASK], { [ASK]: 200 }, [{ text: `Re «${TITLE}»: keep both`, at: 100 }]), {}, "a re-asked line waits for a new answer");
  assert.deepEqual(Object.keys(answeredAsks([ASK], { [ASK]: 200 }, [{ text: `Re «${TITLE}»: keep both`, at: 300 }])), [TITLE]);
});

test("the newest answer wins, across messages and across sources", () => {
  const found = answeredAsks([ASK], {}, [{ text: `Re «${TITLE}»: remove`, at: 300 }, { text: `Re «${TITLE}»: keep both`, at: 100 }]);
  assert.equal(found[TITLE]!.answer, "remove");
  const merged = mergeAnswers({ [TITLE]: { answer: "server", at: 100 } }, { [TITLE]: { answer: "local", at: 200 }, other: { answer: "x", at: 1 } });
  assert.deepEqual(merged, { [TITLE]: { answer: "local", at: 200 }, other: { answer: "x", at: 1 } });
});

test("the answered card says what was answered and that the orchestrator has it", () => {
  assert.equal(answeredStatus({ answer: "keep both", at: 0 }, 5 * 60_000), "Answered «keep both» 5m ago · waiting for the orchestrator");
  assert.equal(answeredStatus({ answer: "x".repeat(80), at: 0 }, 0), `Answered «${"x".repeat(59)}…» just now · waiting for the orchestrator`);
});
