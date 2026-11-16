import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME_MAX, ROLE_NOUNS, STATUS_WORDS, briefName, briefSentence, capName, cleanText, deliveryName, isBookkeeping, parseLedgerTime, roleNoun, statusWord, when, whenInText } from "../src/human.ts";

process.env.TZ = "UTC";

const MIN = 60_000;
const NOW = Date.parse("2026-11-16T17:00:00Z");
const NAMES: Record<string, string> = {
  R1: "Live activity", D1: "Orchestration now design", D2: "Team roles design", I1: "Orchestrate now block",
  I2: "Orchestration now block", I3: "Team roles", D3: "Readable orchestration view",
};
const ctx = {
  now: NOW,
  name: (id: string) => NAMES[id] ?? null,
  reviewed: (id: string) => (id.startsWith("RV-") ? NAMES[id.slice(3)] ?? null : null),
  threadTitle: () => null,
};

test("the cleanup turns this ledger's real strings into names and plain words (docs/human-view.md §1, §3.3)", () => {
  const table: [string, string][] = [
    ["D1 landed 8f52057 (verified). I1 (ai-hub PR) and I2 (view) unblocked and working; I3 working on team-roles.",
      "«Orchestration now design» landed (verified). «Orchestrate now block» (ai-hub PR) and «Orchestration now block» (view) unblocked and working; «Team roles» working on team-roles."],
    ["Gate G-I2 landed 0d8700c (RV-I2 r2 approve; ff push 6e1b580..0d8700c; installed from path, running).",
      "The «Orchestration now block» checks landed (review of «Orchestration now block» round 2 approve; installed from path, running)."],
    ["Owner to look at the Right now block. I2 closed (ack #60, no working files), archived.",
      "You to look at the Right now block. «Orchestration now block» closed (no working files), archived."],
    ["Owner: view not human-readable → D3 design (thr_wgpp44h7xw, #61)", "You: view not human-readable → «Readable orchestration view» design"],
    ["verified — merged eeb9ce1 (PR #53 @5adb1fb); installed orchestrate 0.17.0; ack #51, working files none",
      "verified — merged (PR #53); installed orchestrate 0.17.0, working files none"],
    ["Briefed (#50)", "Briefed"],
    ["345cfab delivered without #66 (numbered timeline); #66 in progress", "delivered without numbered timeline; in progress"],
    ["delivered without #66; sent back for #66; rows added", "delivered; sent back; rows added"],
    ["V1 confirmed #71 and #72 too", "V1 confirmed too"],
    ["«V1» delivered (#70–#72); review started", "«V1» delivered; review started"],
    ["ran rm -f $D/r3-* and cat /tmp/V1-screens/r3-page.jpg", "ran rm -f $D/r3-* and cat /tmp/V1-screens/r3-page.jpg"],
    ["approved r2, then git log a1b2c3d..b4c5d6e", "approved round 2, then git log"],
    ["Owner saw the false card", "You saw the false card"],
    ["landed ae823e0 on main 2026-11-16T15:45+0300, doc only, no after-landing", "landed on main 4 h 15 min ago, doc only, no after-landing"],
    ["PR #53 merged 2026-11-16T17:45+0300 (host clock) on the owner's «Merge it»", "PR #53 merged 2 h 15 min ago on your «Merge it»"],
    ["RV-D1 round 3 approve on ce876ec (ack #31); nits to D1 #3 (#32); owner asked to confirm the design",
      "review of «Orchestration now design» round 3 approve; nits to «Orchestration now design»; you asked to confirm the design"],
    ["waiting for D3", "waiting for «Readable orchestration view»"],
    ["owner confirms the design", "you confirm the design"],
    ["Owner is away; owner has the key", "You are away; you have the key"],
    ["next: on R1's report: send «unblocked» to D1 for sections 4–5", "on «Live activity»'s report: send «unblocked» to «Orchestration now design» for sections 4–5"],
    ["accept T9 (thread-storage/thr_qvipv6ji7b/boards)", "accept T9 (thread-storage/thr_qvipv6ji7b/boards)"],
    ["fix the gate findings on top of 6e1b580 (replacement session)", "fix the gate findings (replacement session)"],
    ["added the timeline to D3 #66's work", "added the timeline to «Readable orchestration view»'s work"],
  ];
  for (const [raw, cleaned] of table) assert.equal(cleanText(raw, ctx), cleaned, raw);
});

test("the cleanup keeps what it can't name: unknown ids, PR links, plain text", () => {
  assert.equal(cleanText("Q8 moved to the owner list", ctx), "Q8 moved to the owner list");
  assert.equal(cleanText("see PR #53 and hub#38", ctx), "see PR #53 and hub#38");
  assert.equal(cleanText("G-X9 failed", ctx), "G-X9 failed");
  assert.equal(cleanText("", ctx), "");
  assert.equal(cleanText(null, ctx), "");
  assert.equal(cleanText("D3 waits on thr_abc", { ...ctx, threadTitle: () => "«Design thread»" }), "«Readable orchestration view» waits on «Design thread»");
});

test("every status cell has a plain word; blocked and gate carry their cause or stage", () => {
  const expected: Record<string, string> = {
    planned: "Not started", "waiting-dependency": "Not started", card: "Waits for you to start it", briefed: "Starting", working: "In progress",
    question: "Has a question for you", blocked: "Blocked", delivered: "Ready for checks", gate: "Being checked", ready: "Ready to land, waits for your OK",
    landed: "Landed", verified: "Done", dropped: "Dropped",
  };
  assert.deepEqual(STATUS_WORDS, expected);
  for (const [status, word] of Object.entries(expected)) assert.equal(statusWord(status), word);
  assert.equal(statusWord("blocked", "no access to the registry"), "Blocked: no access to the registry");
  assert.equal(statusWord("gate", "review"), "Being checked: review");
  assert.equal(statusWord("mystery"), "Mystery");
  assert.equal(statusWord(null), "Status unknown");
});

test("every role has a noun; an unknown role has none", () => {
  assert.deepEqual(ROLE_NOUNS, { researcher: "Research", designer: "Design", planner: "Plan", implementer: "Build", reviewer: "Review", runner: "Run" });
  assert.equal(roleNoun("Designer"), "Design");
  assert.equal(roleNoun("other"), null);
  assert.equal(roleNoun(null), null);
});

test("times: just now, minutes, hours, yesterday, this week, a date, and a future ledger time as its clock time", () => {
  assert.equal(when(NOW - 20_000, NOW), "just now");
  assert.equal(when(NOW - 12 * MIN, NOW), "12 min");
  assert.equal(when(NOW - 125 * MIN, NOW), "2 h 5 min");
  assert.equal(when(NOW - 120 * MIN, NOW), "2 h");
  assert.equal(when(Date.parse("2026-11-15T14:05:00Z"), NOW), "yesterday 14:05");
  assert.equal(when(Date.parse("2026-11-13T14:05:00Z"), NOW), "Fri 14:05");
  assert.equal(when(Date.parse("2026-11-01T14:05:00Z"), NOW), "1 Nov");
  assert.equal(when(Date.parse("2026-11-16T19:10:00Z"), NOW), "19:10", "a ledger time ahead of the clock shows as its clock time");
  assert.equal(when(NOW + MIN, NOW), "just now", "a minute ahead is rounding, not skew");
  assert.equal(when(Date.parse("2026-11-18T09:00:00Z"), NOW), "18 Nov 09:00");
  assert.equal(whenInText(NOW - 12 * MIN, NOW), "12 min ago");
  assert.equal(whenInText(NOW - 20_000, NOW), "just now");
});

test("ledger times parse with or without a colon in the offset", () => {
  assert.equal(parseLedgerTime("2026-11-16T20:00+0300"), Date.parse("2026-11-16T17:00:00Z"));
  assert.equal(parseLedgerTime("2026-11-16T20:00+03:00"), Date.parse("2026-11-16T17:00:00Z"));
  assert.equal(parseLedgerTime("not a time"), null);
});

test("a name from a delivery: the branch or file stem, without the repo, the id or the extension", () => {
  assert.equal(deliveryName("report + thread-storage/thr_em67d6h8se/R1-live-activity.md"), "Live activity");
  assert.equal(deliveryName("bb-plugins feature/orchestration-now-design"), "Orchestration now design");
  assert.equal(deliveryName("bb-plugins feature/team-roles-design (local commits, not pushed; reachable in the worktree)"), "Team roles design");
  assert.equal(deliveryName("kartollika-ai-hub PR from feature/orchestrate-now-block"), "Orchestrate now block");
  assert.equal(deliveryName("review report on I2 @7daf018"), null);
  assert.equal(deliveryName(null), null);
});

test("a name from a child's brief: the first sentence after its id", () => {
  assert.equal(briefName("[orchestrate orchestration-observability #61] D3: design a human-readable Orchestration view. Read …", "D3"), "Design a human-readable Orchestration view");
  assert.equal(briefName("[orchestrate x #64] V1 #2: build the view as designed.\nmore"), "Build the view as designed");
  assert.equal(briefName("D3: design it", "D4"), null, "a brief for another id names nothing");
  assert.equal(briefName("hello"), null);
});

test("bookkeeping rows are acks, archiving, takeovers, rotations and the ledger budget; decisions are not", () => {
  for (const row of ["Acks #34 D1 (db1f783 unchanged)", "Took over from thr_kpk3hf9pr5 as thr_arftevzyhg", "RV-D1 archived (worktree clean). Rotating out", "Archived 10 journal rows of orchestrator #1", "I2 closed (ack #60), archived"]) {
    assert.equal(isBookkeeping(row), true, row);
  }
  for (const row of ["D1 «Now» design confirmed", "RV-D1 round 3 approve on ce876ec", "Started D3 design"]) assert.equal(isBookkeeping(row), false, row);
});

test("the brief parser accepts «<id> #<k> (replacement session): …» and «<id>: …»", () => {
  assert.equal(briefSentence("V1 #2 (replacement session): build the human-readable Orchestration view as designed. Then more.", "V1"), "Build the human-readable Orchestration view as designed");
  assert.equal(briefSentence("D3: write the design doc of a readable view.", "D3"), "Write the design doc of a readable view");
  assert.equal(briefSentence("D3: write it.", "V1"), null);
});

test("names are capped near 40 characters at a word, short ones are kept whole", () => {
  const long = "Orchestration human view with a numbered timeline and progress";
  const capped = capName(long);
  assert.ok(capped.length <= NAME_MAX + 1, capped);
  assert.ok(capped.endsWith("…"));
  assert.ok(long.startsWith(capped.slice(0, -1)));
  assert.equal(capName("Readable orchestration view, dark theme"), "Readable orchestration view, dark theme");
});
