import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { loadTsx } from "./load-tsx.ts";

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

const STAGE: Record<string, string> = { done: "done", running: "now", active: "now", stuck: "now", you: "you", todo: "next" };
const part = (key: string, glyph: string, word: string, extra: Record<string, unknown> = {}) => ({
  key, id: key, step: 0, stage: STAGE[glyph], description: null, title: `Build · ${key} part`, word, age: "", after: null, glyph, running: glyph === "running", note: null, report: null, gate: null, review: null,
  archived: false, details: `${key} · ${word}`, runs: "—", context: "—", ...extra,
});
const numbered = <T extends object>(steps: T[]) => steps.map((p, i) => ({ ...p, step: i + 1 }));
const PLAN = numbered([...["R1", "D1", "D2", "I1", "I3"].map((k) => part(k, "done", "Done")), part("I2", "active", "Ready for checks", { archived: true, review: "Review in progress" }), part("D3", "running", "In progress", { age: "12 min", description: "Write the design doc of a readable view" })]);
const sections = (extra: Record<string, unknown> = {}) => ({
  status: { state: "running", word: "In progress", sentence: "Build · D3 part: writing the doc", progress: "5 of 7 parts done", nothingNeedsYou: true },
  working: [{ key: "D3", title: "Build · D3 part", detail: "Writing the doc", age: "12 min", state: "running" }],
  orchestrator: { state: "idle", line: "Orchestrator · idle", age: "idle 12 min", detail: "Last said: started D3" },
  background: null, stale: false, next: "When the design is ready, you confirm it", plan: PLAN, done: 5, total: 7,
  recently: [1, 2, 3, 4].map((i) => ({ key: `r${i}`, text: `Entry ${i}`, when: `${i * 10} min` })),
  details: { skew: true, statusRaw: "active", ids: [{ id: "D3", title: "Build · D3 part" }] },
  ...extra,
});

test("the bar has one segment per part, coloured by its state, with a text alternative and a tooltip per part", async () => {
  const { ProgressBar, segmentsOf } = await loadTsx(new URL("../src/Progress.tsx", import.meta.url));
  assert.deepEqual(segmentsOf(PLAN).map((s: { glyph: string }) => s.glyph), ["done", "done", "done", "done", "done", "active", "running"]);
  const html = renderToStaticMarkup(createElement(ProgressBar, { plan: PLAN, done: 5 }));
  const dom = new JSDOM(html).window.document;
  const bar = dom.querySelector('[role="img"]')!;
  assert.equal(bar.getAttribute("aria-label"), "5 of 7 parts done");
  const segments = [...bar.children];
  assert.equal(segments.length, 7);
  assert.equal(segments[6]!.getAttribute("title"), "Build · D3 part: In progress");
  assert.match(segments[6]!.className, /bg-blue-500/, "a running part has its own colour, not the near-white primary");
  assert.doesNotMatch(segments[6]!.className, /bg-primary/);
  assert.match(segments[2]!.className, /bg-success/);
  assert.equal(renderToStaticMarkup(createElement(ProgressBar, { plan: [], done: 0 })), "");
});

test("step glyphs: ✓ done, ● running, ◐ in a stage, ! needs someone, ○ not started", async () => {
  const { StepGlyph } = await loadTsx(new URL("../src/Progress.tsx", import.meta.url));
  const marks = ["done", "running", "active", "you", "stuck", "todo"].map((glyph) => new JSDOM(renderToStaticMarkup(createElement(StepGlyph, { glyph }))).window.document.body.textContent);
  assert.deepEqual(marks, ["✓", "●", "◐", "!", "!", "○"]);
});

test("the page shows the status line with its bar, Working now with the orchestrator, Next, the Plan with the archived hint, and three recent entries", async () => {
  const { StatusLine, WorkingNow, Next, Plan, Recently } = await loadTsx(new URL("../src/NowSections.tsx", import.meta.url));
  const s = sections();
  const html = [
    renderToStaticMarkup(createElement(StatusLine, { sections: s, variant: "page" })),
    renderToStaticMarkup(createElement(WorkingNow, { sections: s, variant: "page", threadIds: { D3: "thr_d3" }, openThread: () => {} })),
    renderToStaticMarkup(createElement(Next, { text: s.next })),
    renderToStaticMarkup(createElement(Plan, { sections: s, variant: "page", threadIds: {}, openThread: () => {} })),
    renderToStaticMarkup(createElement(Recently, { sections: s, onMore: () => {} })),
  ].join("");
  const text = new JSDOM(html).window.document.body.textContent!;
  assert.match(text, /In progress/);
  assert.match(text, /5 of 7 parts done · nothing needs you/);
  assert.match(html, /aria-label="5 of 7 parts done"/);
  assert.match(text, /Orchestrator · idle/);
  assert.match(text, /Last said: started D3/);
  assert.match(text, /When the design is ready/);
  assert.match(text, /Its session has ended; the ledger may be behind/);
  assert.match(text, /Entry 3/);
  assert.doesNotMatch(text, /Entry 4/);
  assert.match(text, /Show more/);
  assert.match(html, /aria-label="Open Build · D3 part"/);
});

test("the narrow tab folds the Plan into one line and shows only running rows", async () => {
  const { WorkingNow, Plan } = await loadTsx(new URL("../src/NowSections.tsx", import.meta.url));
  const s = sections({ working: [...sections().working, { key: "wait-I2", title: "Waiting for Build · I2 part", detail: null, age: "25 min", state: "waiting" }] });
  const plan = renderToStaticMarkup(createElement(Plan, { sections: s, variant: "tab", threadIds: {}, openThread: () => {} }));
  assert.match(plan, /Plan · 5 of 7 done/);
  assert.doesNotMatch(plan, /Build · R1 part/);
  const working = renderToStaticMarkup(createElement(WorkingNow, { sections: s, variant: "tab", threadIds: {}, openThread: () => {} }));
  assert.doesNotMatch(working, /Waiting for Build · I2 part/);
  assert.doesNotMatch(working, /Last said/);
  const page = renderToStaticMarkup(createElement(WorkingNow, { sections: s, variant: "page", threadIds: {}, openThread: () => {} }));
  assert.match(page, /Waiting for Build · I2 part/);
});

test("the Plan is a numbered timeline: a step number or a check per step, its state word, its description, a line between steps", async () => {
  const { Plan } = await loadTsx(new URL("../src/NowSections.tsx", import.meta.url));
  const html = renderToStaticMarkup(createElement(Plan, { sections: sections(), variant: "page", threadIds: {}, openThread: () => {} }));
  const doc = new JSDOM(html).window.document;
  const steps = [...doc.querySelectorAll("ol > li")];
  assert.equal(steps.length, 7);
  assert.deepEqual(steps.map((li) => li.getAttribute("data-step")), ["1", "2", "3", "4", "5", "6", "7"]);
  assert.deepEqual(steps.map((li) => li.querySelector("[data-stage]")!.textContent), ["✓", "✓", "✓", "✓", "✓", "6", "7"], "done steps show a check, open ones their number");
  assert.deepEqual(steps.map((li) => li.querySelector("[data-stage]")!.getAttribute("data-stage")), ["done", "done", "done", "done", "done", "now", "now"]);
  assert.equal(steps[6]!.querySelector("button")!.getAttribute("aria-label"), "Step 7: Build · D3 part. Now: In progress");
  assert.match(steps[6]!.textContent!, /Now · In progress · 12 min/);
  assert.match(steps[6]!.textContent!, /Write the design doc of a readable view/);
  assert.doesNotMatch(steps[0]!.textContent!, /(?:Now|Next|Waits on you) ·/, "a done step reads just Done");
  assert.equal(steps.filter((li) => li.querySelector(".w-px")).length, 6, "every step but the last has a line to the next");
  const waiting = renderToStaticMarkup(createElement(Plan, { sections: sections({ plan: numbered([part("A1", "you", "Ready to land, waits for your OK"), part("A2", "todo", "Not started")]) }), variant: "page", threadIds: {}, openThread: () => {} }));
  assert.match(waiting, /Waits on you · Ready to land, waits for your OK/);
  assert.match(waiting, /Next · Not started/);
});

test("from nine steps the Plan folds the done steps it starts with, and keeps the numbering", async () => {
  const { Plan, PLAN_FOLD_FROM, foldedSteps } = await loadTsx(new URL("../src/NowSections.tsx", import.meta.url));
  const many = numbered([...PLAN.filter((p) => p.glyph === "done"), part("X1", "done", "Done"), ...PLAN.filter((p) => p.glyph !== "done"), part("X2", "todo", "Not started")]);
  assert.equal(many.length, PLAN_FOLD_FROM);
  assert.equal(foldedSteps(many), 6);
  const html = renderToStaticMarkup(createElement(Plan, { sections: sections({ plan: many, done: 6, total: 9 }), variant: "page", threadIds: {}, openThread: () => {} }));
  assert.match(html, /Steps 1–6 done/);
  assert.doesNotMatch(html, /Build · R1 part/);
  assert.match(html, /data-step="7"/);
  assert.match(html, /Build · X2 part/);
  const few = renderToStaticMarkup(createElement(Plan, { sections: sections(), variant: "page", threadIds: {}, openThread: () => {} }));
  assert.match(few, /Build · R1 part/, "positive control: under nine steps every step shows");
  assert.equal(foldedSteps(numbered([part("Y1", "running", "In progress"), ...many.slice(1)])), 0, "a long plan that starts with an open step folds nothing");
});

test("Details is folded and names the clock skew", async () => {
  const { Details } = await loadTsx(new URL("../src/NowSections.tsx", import.meta.url));
  const view = { sections: sections(), history: { sessions: "s", handover: null, ledger: "/l.md", warnings: [], notes: [], freeTextNotes: [] }, now: { text: "- doing: x", updated: { label: "" } } };
  const html = renderToStaticMarkup(createElement(Details, { view, ledger: { path: "/l.md" }, report: { text: "r", truncated: false }, renderLedgerText: (t: string) => t, renderReport: (t: string) => t }));
  assert.match(html, /Details for debugging/);
  assert.match(html, /ledger times are ahead of this computer&#x27;s clock|ledger times are ahead of this computer's clock/);
  assert.doesNotMatch(html, /Checkpoint as written/, "folded until opened");
});
