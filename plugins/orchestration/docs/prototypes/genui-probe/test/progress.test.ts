import assert from "node:assert/strict";
import { test } from "node:test";
import { deliveryName, progressModel } from "../lib/progress.ts";

const ledger = {
  ledger: "/x/orchestrate/orchestration-observability.md",
  subtasks: [
    { id: "R1", role: { name: "researcher" }, status: { value: "verified" }, delivery: "report + thread-storage/thr_x/R1-live-activity.md" },
    { id: "D1", role: { name: "designer" }, status: { value: "verified" }, delivery: "bb-plugins feature/orchestration-now-design" },
    { id: "I2", role: { name: "implementer" }, status: { value: "delivered" }, delivery: "bb-plugins feature/orchestration-now-block" },
    { id: "RV-I2", role: { name: "reviewer" }, status: { value: "working" }, delivery: "review report on I2 @7daf018" },
    { id: "X", role: { name: "implementer" }, status: { value: "dropped" } },
  ],
  for_the_owner: ["ask: confirm human-view design 0e56b77 and answer Q1–Q7 — since 2026-11-16T19:40+0300", "note: something"],
};

test("delivery stems become names", () => {
  assert.equal(deliveryName("bb-plugins feature/orchestration-now-design"), "Orchestration now design");
  assert.equal(deliveryName("report + thread-storage/thr_x/R1-live-activity.md"), "Live activity");
});

test("reviewers and dropped rows are not parts; an ask wins the state", () => {
  const model = progressModel(ledger, ["Design · Readable orchestration view"]);
  assert.equal(model.title, "orchestration-observability");
  assert.equal(model.total, 4);
  assert.equal(model.done, 2);
  assert.equal(model.stateWord, "Needs you");
  assert.deepEqual(model.asks, ["confirm human-view design 0e56b77 and answer Q1–Q7"]);
  assert.deepEqual(model.parts.map((p) => p.state), ["running", "waiting", "done", "done"]);
  assert.equal(model.parts[1].name, "Build · Orchestration now block");
});

test("states without asks", () => {
  assert.equal(progressModel({ subtasks: [] }).stateWord, "Planning");
  const done = progressModel({ subtasks: [{ id: "A", status: { value: "verified" } }] });
  assert.equal(done.stateWord, "Done");
  assert.equal(done.sentence, "All 1 parts done");
  const running = progressModel({ subtasks: [{ id: "A", role: { name: "designer" }, name: "Plan", status: { value: "working" } }] });
  assert.equal(running.stateWord, "In progress");
  assert.equal(running.sentence, "Design · Plan");
});
