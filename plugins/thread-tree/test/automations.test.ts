import { test } from "node:test";
import assert from "node:assert/strict";
import { automationDot, overviewSchema, sortAutomations, summarizeOverview, type AutomationSummary } from "../src/automations.ts";

test("overview from bb's Automations plugin trims to the sidebar summary", () => {
  const overview = overviewSchema.parse({
    automations: [
      {
        automation: {
          id: "auto_1",
          projectId: "proj_personal",
          name: "Arc countdown",
          enabled: true,
          trigger: { triggerType: "schedule", cron: "0 9 * * *" },
          execution: { mode: "agent", prompt: "..." },
          nextRunAt: 1793599200000,
          lastRunAt: null,
          lastRunStatus: "succeeded",
          lastRunThreadId: "thr_x",
          lastError: null,
        },
        project: { id: "proj_personal", name: "Personal" },
      },
    ],
  });
  assert.deepEqual(summarizeOverview(overview), [
    {
      id: "auto_1",
      projectId: "proj_personal",
      projectName: "Personal",
      name: "Arc countdown",
      enabled: true,
      nextRunAt: 1793599200000,
      lastRunAt: null,
      lastRunStatus: "succeeded",
      lastRunThreadId: "thr_x",
      lastError: null,
    },
  ]);
});

const auto = (extra: Partial<AutomationSummary>): AutomationSummary => ({
  id: "a",
  projectId: "p",
  projectName: null,
  name: "A",
  enabled: true,
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: null,
  lastRunThreadId: null,
  lastError: null,
  ...extra,
});

test("automation dot: running, then paused, then failed, else done", () => {
  assert.equal(automationDot(auto({ lastRunStatus: "running", enabled: false })), "running");
  assert.equal(automationDot(auto({ enabled: false, lastRunStatus: "failed" })), "stopped");
  assert.equal(automationDot(auto({ lastRunStatus: "failed" })), "error");
  assert.equal(automationDot(auto({ lastError: "boom" })), "error");
  assert.equal(automationDot(auto({ lastRunStatus: "succeeded" })), "done");
  assert.equal(automationDot(auto({})), "done");
});

test("enabled automations come first by next run, paused ones after by name", () => {
  const sorted = sortAutomations([
    auto({ id: "pz", name: "Z", enabled: false }),
    auto({ id: "late", nextRunAt: 200 }),
    auto({ id: "pa", name: "A", enabled: false }),
    auto({ id: "soon", nextRunAt: 100 }),
  ]);
  assert.deepEqual(sorted.map((a) => a.id), ["soon", "late", "pa", "pz"]);
});
