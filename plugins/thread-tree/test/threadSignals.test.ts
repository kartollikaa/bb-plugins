import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STUCK_AFTER_MS,
  contextPercent,
  createSignalReader,
  emptySignalFold,
  failureNote,
  foldSignalEvents,
  formatClock,
  isStuck,
  lastProgressAt,
  runningSubtitle,
  signalTooltipLines,
  stepText,
  toThreadSignals,
  type SignalEventRow,
  type ThreadSignals,
} from "../src/threadSignals.ts";

let seq = 0;
const row = (type: string, createdAt: number, data: Record<string, unknown> = {}): SignalEventRow => ({ seq: ++seq, type, createdAt, data });

const signals = (patch: Partial<ThreadSignals> = {}): ThreadSignals => ({
  turnStartedAt: null,
  step: null,
  lastProgressAt: null,
  rateLimitedAt: null,
  failedTurnsInARow: 0,
  lastFailureRateLimited: false,
  context: null,
  ...patch,
});

test("stepText names a command by its text and a tool by bb's own label", () => {
  assert.equal(stepText({ type: "commandExecution", command: "npm test", presentation: { label: { pending: "Running command" }, title: "npm test" } }), "Running npm test");
  assert.equal(stepText({ type: "commandExecution", command: "git status\ngit log" }), "Running git status");
  assert.equal(stepText({ type: "commandExecution", command: "D=$(mktemp -d) && git archive c149e40 plugins/x | tar -x -C $D" }), "Running git archive c149e40", "assignments and pipes are dropped");
  assert.equal(stepText({ type: "commandExecution", command: "S=abc; bb browser-automation run $S --script 'x'" }), "Running bb browser-automation run");
  assert.equal(stepText({ type: "commandExecution", command: "cd /Users/me/Projects/bb && npm test 2>&1 | tail -5" }), "Running npm test");
  assert.equal(stepText({ type: "commandExecution", command: "VAR=1" }), "Running VAR=1", "a bare assignment stays as it is");
  assert.equal(stepText({ type: "toolCall", tool: "ctx_execute", presentation: { label: { pending: "Running ctx_execute" } } }), "Running ctx_execute");
  assert.equal(stepText({ type: "toolCall", tool: "search" }), "Running search");
  assert.equal(stepText({ type: "reasoning" }), "Thinking");
  assert.equal(stepText({ type: "agentMessage" }), "Writing");
  assert.equal(stepText({ type: "fileChange", presentation: { label: { pending: "Editing files" }, suppress: true } }), null);
  assert.equal(stepText({ type: "userMessage" }), null);
  assert.equal(stepText(null), null);
});

test("a turn's start, latest step and context are folded in order", () => {
  const fold = foldSignalEvents(emptySignalFold(), [
    row("turn/started", 1_000),
    row("item/started", 2_000, { item: { type: "reasoning" } }),
    row("item/started", 3_000, { item: { type: "commandExecution", command: "npm test" } }),
    row("thread/contextWindowUsage/updated", 3_100, { contextWindowUsage: { usedTokens: 210_000, modelContextWindow: 280_000 } }),
  ]);
  const out = toThreadSignals(fold, null);
  assert.equal(out.turnStartedAt, 1_000);
  assert.equal(out.step, "Running npm test");
  assert.deepEqual(out.context, { usedTokens: 210_000, windowTokens: 280_000 });
  assert.equal(fold.lastSeq, seq);
});

test("a subagent's nested turn start does not restart the timer", () => {
  const fold = foldSignalEvents(emptySignalFold(), [
    row("turn/started", 1_000),
    row("turn/started", 5_000, { parentToolCallId: "call-1" }),
  ]);
  assert.equal(toThreadSignals(fold, null).turnStartedAt, 1_000);
});

test("a finished turn clears the step and timer; failures count in a row until one completes", () => {
  let fold = foldSignalEvents(emptySignalFold(), [
    row("turn/started", 1),
    row("turn/completed", 2, { status: "failed" }),
    row("turn/started", 3),
    row("turn/completed", 4, { status: "interrupted" }),
    row("turn/started", 5),
    row("turn/completed", 6, { status: "failed" }),
  ]);
  let out = toThreadSignals(fold, null);
  assert.equal(out.turnStartedAt, null);
  assert.equal(out.step, null);
  assert.equal(out.failedTurnsInARow, 2, "an interruption is the user's, not a failure, and doesn't reset the count");
  fold = foldSignalEvents(fold, [row("turn/started", 7), row("turn/completed", 8, { status: "failed" })]);
  assert.equal(toThreadSignals(fold, null).failedTurnsInARow, 3);
  fold = foldSignalEvents(fold, [row("turn/started", 9), row("turn/completed", 10, { status: "completed" })]);
  out = toThreadSignals(fold, null);
  assert.equal(out.failedTurnsInARow, 0);
});

test("a rate-limit error marks the turn; a failed turn after one is a rate-limit failure", () => {
  let fold = foldSignalEvents(emptySignalFold(), [
    row("turn/started", 1),
    row("provider/error", 2, { message: "Provider error", errorInfo: { category: "rate-limit", httpStatusCode: 429 } }),
  ]);
  assert.equal(toThreadSignals(fold, null).rateLimitedAt, 2);
  fold = foldSignalEvents(fold, [row("turn/completed", 3, { status: "failed" })]);
  let out = toThreadSignals(fold, null);
  assert.equal(out.rateLimitedAt, null, "rate limiting ends with the turn");
  assert.equal(out.lastFailureRateLimited, true);
  fold = foldSignalEvents(fold, [
    row("turn/started", 4),
    row("provider/error", 5, { message: "x", errorInfo: { category: "stream-disconnected", httpStatusCode: 429 }, willRetry: true }),
  ]);
  assert.equal(toThreadSignals(fold, null).rateLimitedAt, 5, "Codex reports a 429 as a stream disconnect");
  fold = foldSignalEvents(fold, [row("provider/error", 6, { message: "x", errorInfo: { category: "internal", httpStatusCode: 500 } }), row("turn/completed", 7, { status: "failed" })]);
  out = toThreadSignals(fold, null);
  assert.equal(out.lastFailureRateLimited, true, "a 429 earlier in the turn still counts");
});

test("compaction or a cleared context drops the stale fill", () => {
  const fold = foldSignalEvents(emptySignalFold(), [
    row("thread/contextWindowUsage/updated", 1, { contextWindowUsage: { usedTokens: 250_000, modelContextWindow: 280_000 } }),
    row("thread/compacted", 2),
  ]);
  assert.equal(toThreadSignals(fold, null).context, null);
  const unknown = foldSignalEvents(emptySignalFold(), [
    row("thread/contextWindowUsage/updated", 1, { contextWindowUsage: { usedTokens: null, modelContextWindow: 280_000 } }),
  ]);
  assert.equal(toThreadSignals(unknown, null).context, null);
});

test("lastProgressAt skips bookkeeping events and takes the newest real one", () => {
  const rows = [
    row("thread/contextWindowUsage/updated", 50),
    row("system/provider-turn-watchdog", 40),
    row("provider/error", 30),
    row("item/agentMessage/delta", 20),
    row("item/started", 10),
  ];
  assert.equal(lastProgressAt(rows), 20);
  assert.equal(lastProgressAt([row("thread/tokenUsage/updated", 5)]), null);
});

test("isStuck: working with no progress for the threshold, one threshold for every thread", () => {
  const now = 10 * STUCK_AFTER_MS;
  const working = { status: "active", hasPendingInteraction: false, indicator: "running" } as const;
  assert.equal(isStuck(working, signals({ lastProgressAt: now - STUCK_AFTER_MS }), now), true);
  assert.equal(isStuck(working, signals({ lastProgressAt: now - STUCK_AFTER_MS + 1 }), now), false);
  assert.equal(isStuck({ ...working, status: "idle" }, signals({ lastProgressAt: 0 }), now), false, "idle is not stuck");
  assert.equal(isStuck({ ...working, hasPendingInteraction: true }, signals({ lastProgressAt: 0 }), now), false, "waiting on the user is input");
  assert.equal(isStuck(working, undefined, now), false, "no data, no claim");
  assert.equal(isStuck(working, signals({ turnStartedAt: now - STUCK_AFTER_MS }), now), true, "no progress yet counts from the turn's start");
});

test("contextPercent and formatClock", () => {
  assert.equal(contextPercent({ usedTokens: 210_000, windowTokens: 280_000 }), 75);
  assert.equal(contextPercent(null), null);
  assert.equal(contextPercent({ usedTokens: 1, windowTokens: 0 }), null);
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(192_400), "3:12");
  assert.equal(formatClock(3_725_000), "1:02:05");
  assert.equal(formatClock(-5), "0:00");
});

test("runningSubtitle: step or rate limit, a high context fill, then project and orchestration", () => {
  assert.equal(runningSubtitle(signals({ step: "Running npm test" }), "bb-plugins", "Orchestrate"), "Running npm test · bb-plugins · under Orchestrate");
  assert.equal(runningSubtitle(undefined, "bb-plugins", null), "bb-plugins");
  assert.equal(
    runningSubtitle(signals({ step: "Thinking", rateLimitedAt: 10, lastProgressAt: 5, context: { usedTokens: 240, windowTokens: 300 } }), "bb", null),
    "Rate limited · 80% context · bb",
  );
  assert.equal(
    runningSubtitle(signals({ step: "Thinking", rateLimitedAt: 10, lastProgressAt: 20, context: { usedTokens: 100, windowTokens: 300 } }), "bb", null),
    "Thinking · bb",
    "progress after the limit means it passed; a low fill stays quiet",
  );
});

test("failureNote: a third failure in a row, else a rate limit", () => {
  assert.equal(failureNote(signals({ failedTurnsInARow: 3, lastFailureRateLimited: true })), "failed 3 times in a row");
  assert.equal(failureNote(signals({ failedTurnsInARow: 2, lastFailureRateLimited: true })), "rate limit");
  assert.equal(failureNote(signals({ failedTurnsInARow: 1 })), null);
  assert.equal(failureNote(undefined), null);
});

test("the reader folds incrementally and reads progress from the newest events", async () => {
  const log: unknown[] = [];
  const events: SignalEventRow[] = [row("turn/started", 100), row("item/started", 200, { item: { type: "reasoning" } })];
  const reader = createSignalReader({
    listEvents: async (args) => {
      log.push(args);
      if (args.order === "desc") return [...events].reverse().slice(0, Number(args.limit));
      return events.filter((event) => event.seq > Number(args.afterSeq ?? 0));
    },
    log: () => {},
  });
  const first = await reader.read("t1");
  assert.equal(first.step, "Thinking");
  assert.equal(first.lastProgressAt, 200);
  events.push(row("item/started", 300, { item: { type: "agentMessage" } }));
  const second = await reader.read("t1");
  assert.equal(second.step, "Writing");
  assert.equal(second.lastProgressAt, 300);
  const ascending = log.filter((args) => (args as { order: string }).order === "asc") as { afterSeq?: string }[];
  assert.equal(ascending.length, 1, "the first read looks back from the newest event");
  assert.equal(ascending[0]!.afterSeq, String(events[1]!.seq), "the second read asks only for newer events");
  assert.equal(reader.has("t1"), true);
  reader.forget("t1");
  assert.equal(reader.has("t1"), false);
});

test("signals are read for working and failed threads only", async () => {
  const { signalThreadIds } = await import("../src/signalThreads.ts");
  const base = { indicator: "none", activity: { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 }, isHidden: false, isArchived: false } as const;
  assert.deepEqual(signalThreadIds([
    { ...base, id: "z-run", status: "active" },
    { ...base, id: "a-fail", status: "error" },
    { ...base, id: "idle", status: "idle" },
    { ...base, id: "bg", status: "idle", activity: { ...base.activity, backgroundAgents: 1 } },
    { ...base, id: "hidden", status: "active", isHidden: true },
    { ...base, id: "archived", status: "error", isArchived: true },
  ] as never), ["a-fail", "bg", "z-run"]);
});

test("signalTooltipLines: the turn's time and step, a rate limit while running, the context fill", () => {
  assert.deepEqual(signalTooltipLines(signals({ turnStartedAt: 0, step: "Running npm test", context: { usedTokens: 1, windowTokens: 4 } }), 65_000), [
    "Turn running 1:05 · Running npm test",
    "Context 25% full",
  ]);
  assert.deepEqual(signalTooltipLines(signals({ turnStartedAt: 0, rateLimitedAt: 1 }), 2), ["Turn running 0:00", "Rate limited, waiting to retry"]);
  assert.deepEqual(signalTooltipLines(signals({ rateLimitedAt: 1 }), 2), [], "a finished turn says nothing about the limit");
  assert.deepEqual(signalTooltipLines(undefined, 0), []);
});

test("a first read of a long turn still finds the turn's start and the failures before it", async () => {
  const events: SignalEventRow[] = [
    row("turn/started", 1),
    row("turn/completed", 2, { status: "failed" }),
    row("turn/started", 3),
    ...Array.from({ length: 450 }, (_, index) => row("item/started", 10 + index, { item: { type: "reasoning" } })),
  ];
  const reader = createSignalReader({
    listEvents: async ({ types, order, beforeSeq, afterSeq, limit }) => {
      let rows = events.filter((event) => (!types || types.includes(event.type)) && event.seq < Number(beforeSeq ?? Infinity) && event.seq > Number(afterSeq ?? 0));
      if (order === "desc") rows = rows.reverse();
      return rows.slice(0, Number(limit));
    },
    log: () => {},
  });
  const out = await reader.read("long");
  assert.equal(out.turnStartedAt, events[2]!.createdAt);
  assert.equal(out.failedTurnsInARow, 1);
  assert.equal(out.step, "Thinking");
});
