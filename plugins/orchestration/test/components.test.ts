import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { loadTsx } from "./load-tsx.ts";

test("the tab renders overall phase and qualification without a title or goal", async () => {
  const { Recap } = await loadTsx(new URL("../src/Recap.tsx", import.meta.url));
  const html = renderToStaticMarkup(createElement(Recap, {
    view: { recap: { goal: null }, phase: { label: "Waiting for verification", detail: "Activation route needed" } },
    title: null, withTitle: false,
  }));
  assert.match(html, /role="status">Waiting for verification/);
  assert.match(html, /Activation route needed/);
});

test("local evidence capture prevents child navigation and selects its exact storage identity", async () => {
  const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost" });
  for (const key of ["window", "document", "HTMLElement", "Element", "Node", "MutationObserver"])
    Object.defineProperty(globalThis, key, { value: dom.window[key as keyof typeof dom.window], configurable: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const { renderSlot } = await import("@get-bb/plugin-sdk/testing/app");
  const { EvidenceMarkdown } = await loadTsx(new URL("../src/EvidenceMarkdown.tsx", import.meta.url));
  const slot = renderSlot({ component: EvidenceMarkdown }, {
    content: "Evidence", sourcePath: "/workspace/", hostId: "host_test", threadId: "thr_test",
    workspace: { environmentId: "env_test", rootPath: "/workspace", storageRootPath: "/storage/thread" },
  });
  try {
    const anchor = dom.window.document.createElement("a");
    anchor.href = "/storage/thread/result.md";
    let childNavigation = 0;
    anchor.addEventListener("click", () => { childNavigation++; });
    slot.container.firstElementChild!.append(anchor);
    const { act } = await import("@testing-library/react");
    await act(async () => { anchor.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
    assert.equal(childNavigation, 0);
    assert.equal(slot.inspection.navigateCalls.length, 0);
    assert.equal(slot.container.querySelector("dialog")?.open, true);
    assert.match(slot.container.textContent ?? "", /Close evidence/);
  } finally {
    slot.lifecycle.unmount();
    dom.window.close();
  }
});

const nowView = (extra: Record<string, unknown> = {}) => ({
  source: "block", orchestrator: { state: "idle", age: "3m", activity: null, background: 0 }, lastTurn: { text: "D2 working: drafted", age: "3m" },
  doing: "I2 — checks running", waits: [{ who: "R1", label: "R1", subtask: "R1", what: "its report", age: "28m", kind: "subtask" }, { who: "owner", label: "You", subtask: null, what: "merge", age: "", kind: "owner" }],
  mismatch: false, next: "on R1's report", blockedBy: "CI is down", lastDecision: { text: "Split", age: "28m" },
  updated: { age: "6m", stale: false, from: "block", label: "updated 6m ago" }, text: "- doing: x", ...extra,
});
const nowProps = (variant: "tab" | "page", now = nowView()) => ({ now, variant, ledgerPath: "/l.md", renderEvidence: (content: string) => createElement("div", null, content), report: { text: "Full report", truncated: false }, workspace: null, threadIds: { R1: "thr_r1" }, openThread: () => {} });

test("the tab variant of the Right now block shows both folds, Blocked by and a one-line wait summary", async () => {
  const { NowBlock } = await loadTsx(new URL("../src/NowBlock.tsx", import.meta.url));
  const html = renderToStaticMarkup(createElement(NowBlock, nowProps("tab")));
  assert.match(html, /Checkpoint as written/);
  assert.match(html, /Full last report/);
  assert.match(html, /Blocked: CI is down/);
  assert.match(html, /Waits on[\s\S]*R1 and you · 28m/);
  assert.doesNotMatch(html, /Next|Last decision|Last turn/);
});

test("the page variant adds next, last turn and last decision, and a muted line for an old ledger", async () => {
  const { NowBlock } = await loadTsx(new URL("../src/NowBlock.tsx", import.meta.url));
  const page = renderToStaticMarkup(createElement(NowBlock, nowProps("page")));
  assert.match(page, /Next/);
  assert.match(page, /Last decision/);
  assert.match(page, /Last turn/);
  const old = renderToStaticMarkup(createElement(NowBlock, nowProps("page", nowView({ source: "none", doing: null, text: null }))));
  assert.match(old, /This ledger has no Now block yet/);
});

test("a clamped free-text checkpoint offers Show all even when it is one long line; an old exporter's text gets the fold", async () => {
  const { NowBlock } = await loadTsx(new URL("../src/NowBlock.tsx", import.meta.url));
  const text = renderToStaticMarkup(createElement(NowBlock, nowProps("page", nowView({ source: "text", doing: null, text: "x ".repeat(400) }))));
  assert.match(text, /Show all/);
  assert.doesNotMatch(text, /Checkpoint as written/);
  const none = renderToStaticMarkup(createElement(NowBlock, nowProps("page", nowView({ source: "none", doing: null, text: "old text" }))));
  assert.match(none, /Checkpoint as written/);
});
