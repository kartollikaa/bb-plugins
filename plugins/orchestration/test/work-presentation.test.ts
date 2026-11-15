import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { buildView } from "../src/view.ts";
import type { LedgerSummary, Subtask } from "../src/contract.ts";
import { loadTsx } from "./load-tsx.ts";

const task = (id: string, status: string, extra: Partial<Subtask> = {}): Subtask => ({ id, name: id, status, statusRaw: status, threadId: null, modelRaw: null, dependsOn: [], gateLine: null, gateFailures: 0, lastFailedKind: null, rotations: 0, ...extra });

test("Work preserves evidence gaps, dependencies and resumed work without certifying criteria", async () => {
  const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost" });
  for (const key of ["window", "document", "HTMLElement", "Element", "Node", "MutationObserver"])
    Object.defineProperty(globalThis, key, { value: dom.window[key as keyof typeof dom.window], configurable: true });
  const { render, fireEvent } = await import("@testing-library/react");
  const { WorkflowHistory } = await loadTsx(new URL("../src/WorkflowHistory.tsx", import.meta.url));
  const ledger: LedgerSummary = { path: "/ledger.md", goal: null, status: "active", forTheOwner: [], orchestratorSessions: 1, lastHandover: null, warnings: [], checkpoint: null, lastDecision: null, subtasks: [
    task("Blocked", "blocked", { criteria: ["Must pass review"], dependsOn: ["Finished", "Missing"] }),
    task("Finished", "verified", { evidence: [{ label: "checks", text: "[Results](./results.md)" }], version: "abc123" }),
    task("Dropped", "dropped"),
    task("Resumed", "verified", { threadId: "thr_resumed" }),
  ] };
  const view = buildView({ ledger, agents: {}, live: { thr_resumed: { status: "active", hasPendingInteraction: false, latestAttentionAt: 0, createdAt: 0 } }, orchestratorThreadId: "thr_owner", now: 100 });
  const opened: string[] = [];
  const slot = render(createElement(WorkflowHistory, { ledger, view, mode: "work", openThread: (id: string) => opened.push(id), renderEvidence: (text: string) => createElement("div", { "data-evidence": true }, text) }));
  try {
    assert.match(slot.container.textContent!, /2 \/ 4 finished/);
    assert.match(slot.container.textContent!, /Active again/);
    fireEvent.click(slot.getByRole("button", { name: /Blocked · Blocked/ }));
    assert.match(slot.container.textContent!, /Requirements, not checked results/);
    assert.match(slot.container.textContent!, /Delivery evidence not recorded/);
    assert.match(slot.container.textContent!, /Revision not recorded/);
    assert.match(slot.container.textContent!, /Missing · Task not recorded/);
    fireEvent.click(slot.getByRole("button", { name: /^Finished · Finished · Verified/ }));
    assert.equal(slot.container.querySelector("[data-evidence]")?.textContent, "[Results](./results.md)");
    assert.match(slot.container.textContent!, /Revision abc123/);
    fireEvent.click(slot.getByRole("button", { name: /^Finished$/ }));
    assert.match(slot.container.textContent!, /Dropped/);
    assert.doesNotMatch(slot.container.textContent!, /Active again/);
    assert.deepEqual(opened, []);
  } finally { slot.unmount(); dom.window.close(); }
});
