import { test } from "node:test";
import assert from "node:assert/strict";
import { linksIn, parseOwnerItem } from "../src/owner.ts";

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

test("only `ask:` makes an ask: an «answered …» record or any other line is a note", () => {
  const answered = "answered 2026-11-14: Remove orchestration bits from thread-tree? → «keep both (recommended)»";
  assert.deepEqual(parseOwnerItem(answered), { kind: "note", text: answered });
  assert.equal(parseOwnerItem("Waiting: owner merge of kartollikaa/bb-plugins#12").kind, "note");
  assert.equal(parseOwnerItem("Nothing lands until you approve the DB migration").kind, "note");
  assert.equal(parseOwnerItem("ask: Approve the migration").kind, "ask", "positive control: a real ask still parses");
});

test("an ask without a title is a note", () => {
  assert.equal(parseOwnerItem("ask:  | why: nothing to say").kind, "note");
});

test("links come out of free text, and a bare #38 or an unowned hub#38 is not a link", () => {
  assert.deepEqual(linksIn("owner merge of kartollikaa/bb-plugins#12, see https://github.com/kartollikaa/bb-plugins/pull/12"), [{ label: "bb-plugins#12", title: "kartollikaa/bb-plugins#12", href: "https://github.com/kartollikaa/bb-plugins/pull/12" }]);
  assert.deepEqual(linksIn("Confirm the release window, see #38 and hub#38"), []);
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
  const links = linksIn(`See ${long}1 and ${long}2 and https://github.com/o/r/pull/3 and https://github.com/o/r/pull/3/files and o/r#3`);
  assert.deepEqual(links.map((l) => l.href), [`${long}1`, `${long}2`, "https://github.com/o/r/pull/3", "https://github.com/o/r/pull/3/files"]);
  assert.deepEqual(links.slice(2).map((l) => l.label), ["r#3", "r#3/files"]);
});

test("a hand-written `Q:` / `Q (asked …):` / `question:` line is an ask, its date dropped from the title", () => {
  const real = "Q (asked 2026-11-16): accept T9 group 4 boards ThreatDrawIntro, MissionChoiceThreat (thread-storage/thr_qvipv6ji7b/boards) — 4.2 red tests done @03169c0d8 local";
  const item = parseOwnerItem(real);
  assert.equal(item.kind, "ask");
  if (item.kind !== "ask") return;
  assert.equal(item.title, "accept T9 group 4 boards ThreatDrawIntro, MissionChoiceThreat (thread-storage/thr_qvipv6ji7b/boards) — 4.2 red tests done @03169c0d8 local");
  assert.deepEqual(item.options, []);
  const q = parseOwnerItem("Q: Merge #12? | options: Yes / No");
  assert.equal(q.kind === "ask" && q.title, "Merge #12?");
  assert.deepEqual(q.kind === "ask" && q.options, ["Yes", "No"]);
  for (const record of ["Q (answered 2026-11-14): accept boards → yes", "Q4: release shipped", "ask (draft): later", "Q&A: none"]) {
    assert.equal(parseOwnerItem(record).kind, "note", record);
  }
  assert.equal(parseOwnerItem("Question: Keep both?").kind, "ask");
  assert.equal(parseOwnerItem("Quiet: nothing runs").kind, "note");
  assert.equal(parseOwnerItem("Q: ").kind, "note");
});
