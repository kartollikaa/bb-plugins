import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeExport } from "../src/ledger.ts";
import { workflowEvents, recentEvents } from "../src/history.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/current.json", import.meta.url), "utf8"));

test("keeps every decision, archived gate and handover in time order without inventing dates", () => {
  const data = structuredClone(fixture);
  data.gates[0].archived = "history/g1.md";
  const events = summarizeExport(data, "/ledger.md").workflow!;
  assert.equal(events.length, 4);
  assert.equal(events[0]!.title, "Start the export");
  assert.equal(events[1]!.task, "T1");
  assert.match(events[1]!.detail!, /checks: passed/);
  assert.equal(events[3]!.title, "Review by R1");
  assert.equal(events[2]!.kind, "handover");
  assert.equal(events.filter((event) => event.kind === "gate").length, 1);
  assert.doesNotMatch(events[1]!.detail!, /pending/);
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

test("keeps useful gate narrative even when the exporter cannot infer a state", () => {
  const events = workflowEvents({ gates: [{ id: "G1", subtask: "T1", stages: [
    { name: "landing", state: "unknown", text: "Accepted on local main; no deployment." },
    { name: "checks", state: "pending", text: "pending" },
  ] }] });
  assert.equal(events.length, 1);
  assert.match(events[0]!.detail!, /Accepted on local main/);
  assert.doesNotMatch(events[0]!.detail!, /pending/);
  assert.equal(events[0]!.at, null);
});

test("task descriptions, scope, criteria and gate evidence survive the snapshot boundary", () => {
  const data = structuredClone(fixture);
  data.subtasks[0].delivery = "Measurement and rollback";
  data.done_when = { T1: ["Named mutation controls pass"], "T2–T7": ["Use the approved plan"] };
  const result = summarizeExport(data, "/ledger.md");
  assert.equal(result.subtasks[0]!.delivery, "Measurement and rollback");
  assert.equal(result.subtasks[0]!.name, "Measurement and rollback");
  assert.equal(result.subtasks[0]!.areas, "scripts/**");
  assert.deepEqual(result.subtasks[0]!.criteria, ["Named mutation controls pass"]);
  assert.deepEqual(result.subtasks[1]!.criteria, ["Shared criterion (T2–T7): Use the approved plan"]);
  assert.equal(result.subtasks[0]!.evidence!.length, 2);
});

test("recent activity shows newest dated records first and undated evidence last", () => {
  const event = (at: string | null) => ({ kind: "gate" as const, task: "T1", title: "Delivery", detail: null, at });
  assert.deepEqual(recentEvents([event(null), event("2026-01-01"), event("2026-02-01"), event("bad")]).map((item) => item.at), ["2026-02-01", "2026-01-01", null, "bad"]);
});

test("dependency prose is kept as a condition rather than rendered as task ids", () => {
  const data = structuredClone(fixture);
  data.subtasks[1].depends_on = ["T1", "check", "peer", "scope"];
  const task = summarizeExport(data, "/ledger.md").subtasks[1]!;
  assert.deepEqual(task.dependsOn, ["T1"]);
  assert.equal(task.dependencyNote, "check peer scope");
});
