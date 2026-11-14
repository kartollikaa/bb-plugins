import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOwnerItem } from "../src/owner.ts";

test("a structured ask names what is asked, why, its links, its thread and its quick replies", () => {
  const item = parseOwnerItem("ask: Merge kartollika-ai-hub#38 | why: S5 passed review and checks | link: https://github.com/kartollikaa/kartollika-ai-hub/pull/38 | thread: thr_abc123 | options: Go as you recommend / Not now");
  assert.deepEqual(item, {
    kind: "ask",
    title: "Merge kartollika-ai-hub#38",
    why: "S5 passed review and checks",
    links: [{ label: "kartollika-ai-hub#38", title: "kartollikaa/kartollika-ai-hub#38", href: "https://github.com/kartollikaa/kartollika-ai-hub/pull/38" }],
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
    { label: "marketplace#958", title: "get-bb/marketplace#958", href: "https://github.com/get-bb/marketplace/pull/958" },
    { label: "example.com/a/b", title: "https://example.com/a/b", href: "https://example.com/a/b" },
  ]);
  assert.deepEqual(item.threads, ["thr_a1", "thr_b2"]);
});

test("a note, and a «Nothing waiting» status line, never need the owner", () => {
  assert.deepEqual(parseOwnerItem("note: Store PR get-bb/marketplace#958 waits on a maintainer label"), { kind: "note", text: "Store PR get-bb/marketplace#958 waits on a maintainer label" });
  assert.deepEqual(parseOwnerItem("Nothing waiting. (#38 merged.) Store PR waits on a maintainer."), { kind: "note", text: "Nothing waiting. (#38 merged.) Store PR waits on a maintainer." });
  assert.equal(parseOwnerItem("Nothing waits on owner input.").kind, "note");
});

test("free text stays a full ask, with its links and threads pulled out as actions", () => {
  const item = parseOwnerItem("Waiting: owner merge of kartollikaa/bb-plugins#12, see https://github.com/kartollikaa/bb-plugins/pull/12 and thread thr_x9.");
  assert.equal(item.kind, "free");
  if (item.kind !== "free") return;
  assert.equal(item.text, "Waiting: owner merge of kartollikaa/bb-plugins#12, see https://github.com/kartollikaa/bb-plugins/pull/12 and thread thr_x9.");
  assert.deepEqual(item.links, [{ label: "bb-plugins#12", title: "kartollikaa/bb-plugins#12", href: "https://github.com/kartollikaa/bb-plugins/pull/12" }]);
  assert.deepEqual(item.threads, ["thr_x9"]);
});

test("a free line without links has none, and a bare #38 or an unowned hub#38 is not a link", () => {
  const item = parseOwnerItem("Confirm the release window, see #38 and hub#38");
  assert.deepEqual(item, { kind: "free", text: "Confirm the release window, see #38 and hub#38", links: [], threads: [] });
});

test("an ask without a title falls back to free text", () => {
  assert.equal(parseOwnerItem("ask:  | why: nothing to say").kind, "free");
});

test("a line that only starts with the word «Nothing» is still an ask", () => {
  assert.equal(parseOwnerItem("Nothing lands until you approve the DB migration").kind, "free");
  assert.equal(parseOwnerItem("Nothing waiting on the deploy until you pick a window").kind, "free");
  assert.equal(parseOwnerItem("Nothing.").kind, "note");
  assert.equal(parseOwnerItem("nothing for the owner").kind, "note");
});

test("an unkeyed ` | ` segment stays with the field before it, and a bare URL segment is kept as a link", () => {
  const pick = parseOwnerItem("ask: Pick A | B | why: x");
  assert.equal(pick.kind === "ask" && pick.title, "Pick A | B");
  const merge = parseOwnerItem("ask: Merge X | why: tests pass | blocked on CI flake | link: https://a.example/1 | https://b.example/2");
  assert.equal(merge.kind, "ask");
  if (merge.kind !== "ask") return;
  assert.equal(merge.why, "tests pass | blocked on CI flake");
  assert.deepEqual(merge.links.map((l) => l.href), ["https://a.example/1", "https://b.example/2"]);
});

test("links are deduplicated by address, not by label", () => {
  const long = "https://example.com/" + "a".repeat(60);
  const item = parseOwnerItem(`See ${long}1 and ${long}2 and https://github.com/o/r/pull/3 and https://github.com/o/r/pull/3/files and o/r#3`);
  assert.equal(item.kind, "free");
  if (item.kind !== "free") return;
  assert.deepEqual(item.links.map((l) => l.href), [`${long}1`, `${long}2`, "https://github.com/o/r/pull/3", "https://github.com/o/r/pull/3/files"]);
  assert.deepEqual(item.links.slice(2).map((l) => l.label), ["r#3", "r#3/files"]);
});
