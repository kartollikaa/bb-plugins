import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOwnerItem } from "../src/owner.ts";

test("a structured ask names what is asked, why, its links, its thread and its quick replies", () => {
  const item = parseOwnerItem("ask: Merge kartollika-ai-hub#38 | why: S5 passed review and checks | link: https://github.com/kartollikaa/kartollika-ai-hub/pull/38 | thread: thr_abc123 | options: Go as you recommend / Not now");
  assert.deepEqual(item, {
    kind: "ask",
    title: "Merge kartollika-ai-hub#38",
    why: "S5 passed review and checks",
    links: [{ label: "kartollikaa/kartollika-ai-hub#38", href: "https://github.com/kartollikaa/kartollika-ai-hub/pull/38" }],
    threads: ["thr_abc123"],
    options: ["Go as you recommend", "Not now"],
  });
});

test("keys are case-insensitive, optional and may repeat; an options value keeps a slash without spaces", () => {
  const item = parseOwnerItem("Ask: Pick the toast | Options: 5a / 5c/5d | link: get-bb/marketplace#958 https://example.com/a/b | thread: thr_a1 thr_b2");
  assert.equal(item.kind, "ask");
  if (item.kind !== "ask") return;
  assert.equal(item.why, null);
  assert.deepEqual(item.options, ["5a", "5c/5d"]);
  assert.deepEqual(item.links, [
    { label: "get-bb/marketplace#958", href: "https://github.com/get-bb/marketplace/pull/958" },
    { label: "example.com/a/b", href: "https://example.com/a/b" },
  ]);
  assert.deepEqual(item.threads, ["thr_a1", "thr_b2"]);
});

test("a note, and a free line that starts with «Nothing», never need the owner", () => {
  assert.deepEqual(parseOwnerItem("note: Store PR get-bb/marketplace#958 waits on a maintainer label"), { kind: "note", text: "Store PR get-bb/marketplace#958 waits on a maintainer label" });
  assert.deepEqual(parseOwnerItem("Nothing waiting. (#38 merged.) Store PR waits on a maintainer."), { kind: "note", text: "Nothing waiting. (#38 merged.) Store PR waits on a maintainer." });
  assert.equal(parseOwnerItem("Nothing waits on owner input.").kind, "note");
});

test("free text stays a full ask, with its links and threads pulled out as actions", () => {
  const item = parseOwnerItem("Waiting: owner merge of kartollikaa/bb-plugins#12, see https://github.com/kartollikaa/bb-plugins/pull/12 and thread thr_x9.");
  assert.equal(item.kind, "free");
  if (item.kind !== "free") return;
  assert.equal(item.text, "Waiting: owner merge of kartollikaa/bb-plugins#12, see https://github.com/kartollikaa/bb-plugins/pull/12 and thread thr_x9.");
  assert.deepEqual(item.links, [{ label: "kartollikaa/bb-plugins#12", href: "https://github.com/kartollikaa/bb-plugins/pull/12" }]);
  assert.deepEqual(item.threads, ["thr_x9"]);
});

test("a free line without links has none, and a bare #38 or an unowned hub#38 is not a link", () => {
  const item = parseOwnerItem("Confirm the release window, see #38 and hub#38");
  assert.deepEqual(item, { kind: "free", text: "Confirm the release window, see #38 and hub#38", links: [], threads: [] });
});

test("an ask without a title falls back to free text", () => {
  assert.equal(parseOwnerItem("ask:  | why: nothing to say").kind, "free");
});
