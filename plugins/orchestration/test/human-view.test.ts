import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Agent, LedgerSummary } from "../src/contract.ts";
import { summarizeExport } from "../src/ledger.ts";
import { buildView, type LiveThread, type View } from "../src/view.ts";

process.env.TZ = "UTC";

const MIN = 60_000;
const ORCH = "thr_3kp87mtayp";
const D3 = "thr_wgpp44h7xw";
const I2 = "thr_8wn32kum9s";
const NOW = Date.parse("2026-11-16T20:30+03:00");
const raw = JSON.parse(readFileSync(new URL("./fixtures/observability-export.json", import.meta.url), "utf8"));
const LEDGER: LedgerSummary = summarizeExport(raw, "/home/owner/.claude/projects/p/orchestrate/orchestration-observability.md");

const agent = (extra: Partial<Agent> = {}): Agent => ({ model: null, effort: null, contextUsed: null, contextWindow: null, lastOutput: null, lastReportAt: null, ...extra });

/** This orchestration while the readable-view design ran: D3 is a child the ledger doesn't name yet, I2's session is archived. */
function render({ now = NOW, ledger = LEDGER, live = {} }: { now?: number; ledger?: LedgerSummary; live?: Record<string, LiveThread> } = {}): View {
  return buildView({
    ledger,
    now,
    orchestratorThreadId: ORCH,
    live: {
      [ORCH]: { status: "idle", hasPendingInteraction: false, latestAttentionAt: now - 12 * MIN, createdAt: now - 600 * MIN },
      [D3]: { status: "active", hasPendingInteraction: false, latestAttentionAt: now - 12 * MIN, createdAt: now - 12 * MIN, parentThreadId: ORCH, title: "orchestration-observability · D3 #1" },
      ...live,
    },
    agents: { [I2]: agent({ archivedAt: now - 90 * MIN }) },
    briefs: { [D3]: "[orchestrate orchestration-observability #61] D3: design a human-readable Orchestration view. Read the ledger first." },
    activity: { [D3]: { turnStartedAt: now - 12 * MIN, lastTurnStartedAt: now - 12 * MIN, step: "Writing docs/human-view.md", stepStartedAt: now - 40_000, background: [] } },
    report: { text: "I've started a design subtask, «Design a human-readable Orchestration view», to make the view readable." },
  });
}

const withStatus = (id: string, status: string): LedgerSummary => ({
  ...LEDGER,
  subtasks: LEDGER.subtasks.map((s) => (s.id === id ? { ...s, status, statusRaw: status } : s)),
});

/** Landing order: R1 has no landing and keeps its place; D1, D2, I2, I3, I1 follow the landing queue; D3, not in the ledger, comes last. */
const PART_TITLES = [
  "Research · Live activity",
  "Design · Orchestration now design",
  "Design · Team roles design",
  "Build · Orchestration now block",
  "Build · Team roles",
  "Build · Orchestrate now block",
  "Design a human-readable Orchestration view",
];

test("the ledger as it is: In progress on the running design, 5 of 7 parts done, reviewers folded into their parts", () => {
  const v = render();
  const { status, plan } = v.sections;
  assert.equal(status.word, "In progress");
  assert.equal(status.sentence, "Design a human-readable Orchestration view: writing docs/human-view.md · 40s");
  assert.equal(status.progress, "5 of 7 parts done");
  assert.equal(status.nothingNeedsYou, true);
  assert.equal(v.rowLabel, `In progress · ${status.sentence}`);
  assert.deepEqual(plan.map((p) => p.title), PART_TITLES, "the name fallback of §3.4 on every row: the child's brief, then each delivery");
  assert.deepEqual(plan.map((p) => p.glyph), ["done", "done", "done", "active", "done", "done", "running"]);
  assert.deepEqual(plan.map((p) => p.word), ["Done", "Done", "Done", "Ready for checks", "Done", "Done", "In progress"]);
  assert.equal(plan.some((p) => p.id.startsWith("RV-")), false, "no reviewer is a part");
  assert.equal(plan.find((p) => p.id === "I2")!.review, "Review in progress");
  assert.equal(plan.find((p) => p.id === "D1")!.review, "Review approved");
  const d3 = plan.find((p) => p.key === D3)!;
  assert.equal(d3.id, "D3", "the child's title `… · D3 #1` labels it D3");
  assert.equal(d3.age, "12 min");
  assert.equal(plan.find((p) => p.id === "D2")!.gate, null, "«Gates G-D2» only names the gate");
  assert.equal(plan.find((p) => p.id === "D1")!.gate, null, "a done part's empty gate says nothing");
  assert.equal(plan.find((p) => p.id === "I2")!.gate, "Checks passed");
});

test("an open part whose session bb archived carries the muted hint; a done one doesn't", () => {
  const v = render();
  assert.deepEqual(v.sections.plan.filter((p) => p.archived).map((p) => p.id), ["I2"]);
  const closed = render({ ledger: withStatus("I2", "verified") });
  assert.equal(closed.sections.status.progress, "6 of 7 parts done", "the ledger written by the rules: I2 done");
  assert.equal(closed.sections.plan.some((p) => p.archived), false);
});

test("Working now: the running design with its live step, then the idle orchestrator with what it last said", () => {
  const { working, orchestrator, background } = render().sections;
  assert.deepEqual(working, [{ key: D3, title: "Design a human-readable Orchestration view", detail: "Writing docs/human-view.md · 40s", age: "12 min", state: "running" }]);
  assert.equal(orchestrator.line, "Orchestrator · idle");
  assert.equal(orchestrator.age, "idle 12 min");
  assert.equal(orchestrator.detail, "Last said: I've started a design subtask, «Design a human-readable Orchestration view», to make the view readable.");
  assert.equal(background, null);
});

test("Recently: newest first by time, bookkeeping skipped, owner rows read «You»", () => {
  const { recently } = render().sections;
  assert.equal(recently[0]!.when, "10 min");
  assert.match(recently[0]!.text, /^You confirmed Q1–Q11 A/);
  const ages = recently.slice(0, 6).map((r) => r.when);
  assert.deepEqual(ages, ["10 min", "25 min", "50 min", "1 h 15 min", "1 h 20 min", "1 h 25 min"]);
  for (const entry of recently) assert.doesNotMatch(entry.text, /^(?:Acks?|Took over|Archived|Rotat)/i, entry.text);
  const journal = LEDGER.journal!.filter((row) => /^(?:Acks #34|Took over from)/.test(row.text));
  assert.ok(journal.length >= 2, "positive control: the bookkeeping rows are in the fixture");
});

test("ledger times ahead of the clock show as clock times, and Details notes the skew", () => {
  const early = render({ now: Date.parse("2026-11-16T15:13+03:00") });
  assert.equal(early.sections.details.skew, true);
  assert.equal(early.sections.recently[0]!.when, "17:20", "20:20+03:00 is ahead of 15:13");
  assert.equal(render().sections.details.skew, false);
});

test("a structured Now block: the orchestrator waits for the design by name, and Next is a cleaned sentence", () => {
  const v = render({
    ledger: {
      ...LEDGER,
      now: {
        structured: true, updated: "2026-11-16T20:18+03:00", doing: "waiting for the readable-view design",
        waitingOn: [{ who: "D3", subtask: "D3", what: "the design doc of a readable Orchestration view", since: "2026-11-16T20:18+03:00" }],
        next: "when the design is ready, owner confirms it; then it is built and reviewed", blockedBy: "none", backgroundWaits: [],
      },
    },
  });
  const { orchestrator, next, working, status } = v.sections;
  assert.equal(orchestrator.line, "Orchestrator · waiting for «Design a human-readable Orchestration view»");
  assert.equal(orchestrator.detail, "Waiting for the readable-view design");
  assert.equal(next, "When the design is ready, you confirm it; then it is built and reviewed");
  assert.equal(working.length, 1, "a running part the orchestrator waits on shows once");
  assert.equal(status.word, "In progress", "`blocked by: none` is not blocked");
});

test("an owner ask about a part: Needs you, the part's name as who, the reviewer named by its part", () => {
  const v = render({
    ledger: {
      ...LEDGER,
      forTheOwner: [...LEDGER.forTheOwner, "ask: D1: Confirm the «Right now» block design | why: RV-D1 approved it after three rounds. It lands once you confirm. | options: Confirm (recommended) / Not yet"],
    },
  });
  assert.equal(v.sections.status.word, "Needs you");
  assert.equal(v.sections.status.sentence, "1 decision");
  assert.equal(v.sections.status.nothingNeedsYou, false);
  const ask = v.asks[0]!;
  assert.equal(ask.who, "Design · Orchestration now design");
  assert.equal(ask.title, "Confirm the «Right now» block design");
  assert.equal(ask.text, "Review of «Orchestration now design» approved it after three rounds. It lands once you confirm.");
  assert.equal(ask.replyTitle, "D1: Confirm the «Right now» block design", "replies quote the ledger's own title");
});

const LEDGER_IDS = new RegExp(`(?<![\\w-])(?:${[...LEDGER.subtasks.map((s) => s.id), "D3"].join("|")})(?![\\w-])`);
const UNREADABLE: [string, RegExp][] = [
  ["a thread id", /(?<![\w/])thr_[a-z0-9]+(?!\/)/],
  ["a commit SHA", /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/],
  ["a message number", /(?<!PR )(?<![\w/])#\d+/],
  ["an ack", /\back\b/i],
  ["a gate id", /\bG-[A-Z]/],
  ["a ledger key", /\b(?:doing|waiting on|next|blocked by|checkpoint|updated|since|for):/i],
  ["a ledger id", LEDGER_IDS],
];

function firstGlance(v: View): string[] {
  const s = v.sections;
  return [
    s.status.word, s.status.sentence, s.status.progress, s.next ?? "", s.background ?? "",
    s.orchestrator.line, s.orchestrator.detail ?? "",
    ...s.working.flatMap((w) => [w.title, w.detail ?? ""]),
    ...s.plan.flatMap((p) => [p.title, p.word, p.description ?? "", p.after ?? "", p.note ?? "", p.report ?? "", p.gate ?? "", p.review ?? ""]),
    ...s.recently.map((r) => r.text),
    ...v.asks.flatMap((a) => [a.who, a.title ?? "", a.text]),
    v.nudge?.label ?? "", v.nudge?.text ?? "", v.rowLabel,
  ].filter(Boolean);
}

test("no first-glance string carries a thread id, a SHA, a message number, an ack, a gate id, a ledger key or a ledger id", () => {
  const views = [
    render(),
    render({ ledger: { ...LEDGER, forTheOwner: [...LEDGER.forTheOwner, "ask: D1: Confirm the design | why: RV-D1 approved it (ack #31) on ce876ec | options: Confirm / Not yet"] } }),
    render({ ledger: { ...LEDGER, now: { structured: true, updated: null, doing: "waiting on: D3 (thr_wgpp44h7xw, #61)", waitingOn: [], next: "next: G-I2 landed 0d8700c", blockedBy: null, backgroundWaits: [] } } }),
  ];
  let checked = 0;
  for (const v of views) {
    for (const text of firstGlance(v)) {
      for (const [what, pattern] of UNREADABLE) assert.doesNotMatch(text, pattern, `${what} in «${text}»`);
      checked += 1;
    }
  }
  assert.ok(checked > 60, `checked ${checked} strings`);
  const rawStrings = [LEDGER.checkpoint!.text, ...LEDGER.subtasks.map((s) => s.statusRaw ?? "")].join("\n");
  for (const [what, pattern] of UNREADABLE.slice(0, 5)) assert.match(rawStrings + " ack #1 G-I2 thr_abc", pattern, `positive control: the raw ledger has ${what}`);
});

test("the Plan is a timeline in landing order: numbered steps, a stage each, a one-line description", () => {
  const { plan } = render().sections;
  assert.deepEqual(plan.map((p) => [p.step, p.id]), [[1, "R1"], [2, "D1"], [3, "D2"], [4, "I2"], [5, "I3"], [6, "I1"], [7, "D3"]]);
  assert.deepEqual(plan.map((p) => p.stage), ["done", "done", "done", "now", "done", "done", "now"]);
  const description = Object.fromEntries(plan.map((p) => [p.id, p.description]));
  assert.equal(description.D1, "Ledger block format with example and old-ledger fallback", "the first «Done when» criterion, without «— read the doc»");
  assert.equal(description.I2, "Orchestration view", "a «Done when» that only points at a doc gives way to the landing queue's words");
  assert.equal(description.I1, "Ai-hub PR");
  assert.equal(description.R1, null, "no brief, no criterion, not in the landing queue");
  assert.equal(description.D3, null, "the brief's sentence is already the step's name");
  for (const p of plan) if (p.description) assert.ok(p.description.length <= 140 && !p.description.includes("\n"), p.description);
});

test("a step's description comes from its thread's brief first, cleaned like the rest, and the brief doesn't rename a ledger part", () => {
  const i2Thread = LEDGER.subtasks.find((s) => s.id === "I2")!.threadId!;
  const v = buildView({
    ledger: LEDGER, now: NOW, orchestratorThreadId: ORCH, live: {}, agents: {},
    briefs: { [i2Thread]: "[orchestrate orchestration-observability #40] I2: build the Right now block from D1's design at 8f52057 (thr_wgpp44h7xw). Then report." },
  });
  const i2 = v.sections.plan.find((p) => p.id === "I2")!;
  assert.equal(i2.title, "Build · Orchestration now block", "the ledger's own naming stays");
  assert.equal(i2.description, "Build the Right now block from «Orchestration now design»'s design");
});

test("a description that only repeats the step's name gives way to the next source", () => {
  const ledger = { ...LEDGER, subtasks: LEDGER.subtasks.map((s) => (s.id === "D1" ? { ...s, name: "Ledger block format with example" } : s)) };
  const d1 = render({ ledger }).sections.plan.find((p) => p.id === "D1")!;
  assert.equal(d1.description, "Orchestration now design", "the criterion starts with the name, so the delivery's words show");
});

test("a step with no brief and no criterion is described by its delivery before the landing queue", () => {
  const ledger = { ...LEDGER, subtasks: LEDGER.subtasks.map((s) => (s.id === "I2" ? { ...s, name: "Right now block", criteria: [], delivery: "bb-plugins feature/live-step-rows" } : s)) };
  assert.equal(render({ ledger }).sections.plan.find((p) => p.id === "I2")!.description, "Live step rows");
  assert.equal(render().sections.plan.find((p) => p.id === "I2")!.description, "Orchestration view", "positive control: a delivery that only repeats the name is skipped");
});

test("without a landing queue, steps keep the ledger's subtask order", () => {
  const { plan } = render({ ledger: { ...LEDGER, landingQueue: [] } }).sections;
  assert.deepEqual(plan.map((p) => p.id), ["R1", "D1", "D2", "I1", "I2", "I3", "D3"]);
  assert.deepEqual(plan.map((p) => p.step), [1, 2, 3, 4, 5, 6, 7]);
});

test("a long part name is capped in the Plan title, and its full text stays in the row's details", () => {
  const long = "Orchestration human view with a numbered timeline and native progress";
  const ledger = { ...LEDGER, subtasks: LEDGER.subtasks.map((s) => (s.id === "I3" ? { ...s, name: long } : s)) };
  const row = render({ ledger }).sections.plan.find((p) => p.key === "I3")!;
  assert.ok(row.title.length <= "Build · ".length + 41, row.title);
  assert.match(row.title, /…$/);
  assert.ok(row.details.startsWith(long), row.details);
});
