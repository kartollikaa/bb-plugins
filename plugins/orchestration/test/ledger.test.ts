import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orchestratorIdOf, summarizeExport } from "../src/ledger.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/current.json", import.meta.url), "utf8"));

test("the first line names the orchestrator: a thread id wins, else the first word", () => {
  assert.equal(orchestratorIdOf("Orchestrator: thr_uqnwd7q4qf"), "thr_uqnwd7q4qf");
  assert.equal(orchestratorIdOf("Orchestrator: bb thread thr_abc123 (took over)"), "thr_abc123");
  assert.equal(orchestratorIdOf("Оркестратор: self:20261114T1015-a1b2"), "self:20261114T1015-a1b2");
  assert.equal(orchestratorIdOf("# Goal"), null);
  assert.equal(orchestratorIdOf("Backend: bb"), null);
});

test("summarizes the export sample", () => {
  const summary = summarizeExport(fixture, "/x/current.md");
  assert.equal(summary.goal, "Ship the export command");
  assert.equal(summary.status, "active");
  assert.deepEqual(summary.forTheOwner, ["Confirm the release window for T1"]);
  assert.equal(summary.orchestratorSessions, 1);
  assert.deepEqual(summary.warnings, []);
  const [t1, t2] = summary.subtasks;
  assert.equal(t1!.status, "gate");
  assert.equal(t1!.gateLine, "Checks passed · review running");
  assert.equal(t1!.gateFailures, 0);
  assert.equal(t1!.rotations, 1);
  assert.equal(t1!.threadId, null, "a non-bb session id has no thread");
  assert.deepEqual(t2!.dependsOn, ["T1"]);
  assert.equal(t2!.gateLine, null);
});

test("counts failed checks and reviews across the subtask's open gates, not archived ones", () => {
  const stage = (kind: string, state: string) => ({ name: kind, kind, state, state_source: "explicit", time: null, text: state });
  const data = {
    ...fixture,
    subtasks: [{ ...fixture.subtasks[0], id: "S6", session: "thr_abc", status: { value: "gate", raw: "gate" } }],
    gates: [
      { id: "G6", subtask: "S6", archived: null, stages: [stage("review", "failed"), stage("other", "failed")], summary: { review: { state: "failed" } } },
      { id: "G6b", subtask: "S6", archived: null, stages: [stage("checks", "failed"), stage("review", "failed")], summary: { checks: { state: "failed" }, review: { state: "failed" } } },
      { id: "G6a", subtask: "S6", archived: "history/x.md", stages: [stage("review", "failed")], summary: {} },
    ],
  };
  const [s6] = summarizeExport(data, "/x.md").subtasks;
  assert.equal(s6!.gateFailures, 3);
  assert.equal(s6!.lastFailedKind, "review");
  assert.equal(s6!.threadId, "thr_abc");
  assert.equal(s6!.gateLine, "Checks failed · review failed · 3 failures");
});

test("a status cell with more text falls back to its first word when that is a status", () => {
  const row = (raw: string) => ({ ...fixture.subtasks[0], status: { value: null, raw } });
  const [a, b] = summarizeExport({ ...fixture, subtasks: [row("delivered; review RO1, merge = owner"), row("someday")] }, "/x.md").subtasks;
  assert.equal(a!.status, "delivered");
  assert.equal(b!.status, null);
  assert.equal(b!.statusRaw, "someday");
});

test("a wrong schema or a newer version is a warning, not a crash", () => {
  assert.match(summarizeExport({ schema: "other" }, "/x.md").warnings[0]!, /Unexpected export schema/);
  assert.match(summarizeExport({ ...fixture, schema_version: 2 }, "/x.md").warnings[0]!, /version 2/);
  assert.deepEqual(summarizeExport(null, "/x.md").subtasks, []);
});

test("orchestrator handovers count sessions and give the last reason", () => {
  const data = {
    ...fixture,
    handovers: [
      { id: "H1", role: "orchestrator", to_id: "thr_b", why: "2026-11-14; context budget", time: { at: "2026-11-14" } },
      { id: "H2", role: "S1", to_id: "thr_c", why: "x", time: null },
      { id: "H3", role: "orchestrator", to_id: "thr_d", why: "session budget", time: null },
    ],
  };
  const summary = summarizeExport(data, "/x.md");
  assert.equal(summary.orchestratorSessions, 3);
  assert.deepEqual(summary.lastHandover, { why: "session budget", at: null });
});
