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
