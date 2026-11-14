import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeExport } from "../src/ledger.ts";
import { workflowEvents } from "../src/history.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/current.json", import.meta.url), "utf8"));

test("keeps every decision, archived gate and handover in time order without inventing dates", () => {
  const data = structuredClone(fixture);
  data.gates[0].archived = "history/g1.md";
  const events = summarizeExport(data, "/ledger.md").workflow!;
  assert.equal(events.length, 8);
  assert.equal(events[0]!.title, "Start the export");
  assert.equal(events[1]!.task, "T1");
  assert.match(events[1]!.detail!, /Archived gate/);
  assert.equal(events[4]!.title, "Review by R1");
  assert.equal(events[3]!.kind, "handover");
  assert.equal(events[5]!.at, null);
  assert.equal(events.filter((event) => event.kind === "gate").length, 5);
  assert.equal(summarizeExport(data, "/ledger.md").subtasks[0]!.gateLine, null);
});

test("partial and undated exports remain readable and equal timestamps retain source order", () => {
  assert.deepEqual(workflowEvents(null), []);
  const events = workflowEvents({ decision_journal: [null, { decision: "Undated" }, { decision: "Invalid date", when: { time: { at: "bad" } } }, { decision: "Dated", when: { time: { at: "2026-01-01" } } }] });
  assert.deepEqual(events.map((event) => event.title), ["Dated", "Undated", "Invalid date"]);
});

test("an archived gate exported as a reference keeps its place in history", () => {
  const events = workflowEvents({ gates: [{ id: "G2", subtask: "T2", archived: "history/G2.md", stages: [] }] });
  assert.deepEqual(events, [{ kind: "gate", task: "T2", title: "G2 · archived", detail: "history/G2.md", at: null }]);
});
