import { test } from "node:test";
import assert from "node:assert/strict";
import { glyphMotionClass, isIdleGlyph, resolveRowGlyph, ROLLUP_GLYPH, rollupGlyph, type GlyphThread } from "../src/statusGlyph.ts";

const idleActivity = { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0 };

const thread = (indicator: string, indicatorLabel: string | null = null, extra: Partial<GlyphThread> = {}): GlyphThread => ({
  status: "idle",
  isArchived: false,
  indicator,
  indicatorLabel,
  runtimeStatus: "idle",
  activity: idleActivity,
  ...extra,
});

const running = { label: "Syncing", icon: "Loading", tone: "running" as const };

test("each host indicator passes through with the host's label", () => {
  const cases: [string, string][] = [
    ["runtime", "Thread working"],
    ["waiting-for-input", "Thread needs user input"],
    ["unread-error", "Unread thread failed"],
    ["unread-success", "Unread thread succeeded"],
    ["queued-failed", "Queued message failed to send"],
    ["queued-waiting", "Thread has a message waiting to send"],
    ["plan-mode", "Plan mode active"],
    ["goal", "Goal active"],
    ["workflow", "Workflow running"],
    ["background-agent", "Background agent running"],
    ["background-command", "Background command running"],
  ];
  for (const [indicator, label] of cases) {
    assert.deepEqual(resolveRowGlyph(thread(indicator, label), false, null), { indicator, rowStatus: null, label }, indicator);
  }
});

test("an idle thread gets the faint idle dot and no state label", () => {
  const glyph = resolveRowGlyph(thread("none"), false, null);
  assert.deepEqual(glyph, { indicator: "none", rowStatus: null, label: null });
  assert.equal(isIdleGlyph(glyph), true);
});

test("only a thread bb's glyph would leave blank is idle", () => {
  assert.equal(isIdleGlyph(resolveRowGlyph(thread("none"), true, null)), false);
  assert.equal(isIdleGlyph(resolveRowGlyph(thread("none"), false, running)), false);
  assert.equal(isIdleGlyph(resolveRowGlyph(thread("unread-success", "x"), false, null)), false);
  assert.equal(isIdleGlyph(resolveRowGlyph(thread("teleporting", "x"), false, null)), true);
});

test("an unknown future indicator falls back to nothing", () => {
  assert.deepEqual(resolveRowGlyph(thread("teleporting", "Teleporting"), false, null), { indicator: "none", rowStatus: null, label: null });
});

test("a draft on an idle thread is the pencil", () => {
  assert.deepEqual(resolveRowGlyph(thread("none"), true, null), { indicator: "draft", rowStatus: null, label: "Thread has unsubmitted draft" });
});

test("a draft on a busy thread is the working-draft glyph", () => {
  const label = "Thread working with unsubmitted draft";
  assert.equal(resolveRowGlyph(thread("runtime", "Thread working", { runtimeStatus: "active" }), true, null).indicator, "working-draft");
  assert.equal(resolveRowGlyph(thread("plan-mode", null, { activity: { ...idleActivity, planMode: 1 } }), true, null).label, label);
  assert.equal(resolveRowGlyph(thread("background-agent", null, { activity: { ...idleActivity, backgroundAgents: 1 } }), true, null).indicator, "working-draft");
});

test("a draft on a thread the host reports busy is the working-draft glyph, even when its own counts read idle", () => {
  for (const indicator of ["runtime", "workflow", "background-agent", "background-command", "plan-mode"]) {
    assert.equal(resolveRowGlyph(thread(indicator, "x"), true, null).indicator, "working-draft", indicator);
  }
});

test("a read root thread whose last turn failed keeps the error glyph", () => {
  assert.deepEqual(resolveRowGlyph(thread("none", null, { status: "error" }), false, null), {
    indicator: "unread-error",
    rowStatus: null,
    label: "Last turn failed",
  });
});

test("a failed subthread, which bb never marks unread, keeps the error glyph over a draft and a row status", () => {
  const failed = thread("none", null, { status: "error" });
  assert.equal(resolveRowGlyph(failed, true, null).indicator, "unread-error");
  assert.deepEqual(resolveRowGlyph(failed, false, running), { indicator: "unread-error", rowStatus: null, label: "Last turn failed" });
});

test("a failed thread keeps the host's own error label, and a question still outranks the failure", () => {
  assert.equal(resolveRowGlyph(thread("unread-error", "Unread thread failed", { status: "error" }), false, null).label, "Unread thread failed");
  assert.equal(resolveRowGlyph(thread("waiting-for-input", "w", { status: "error" }), false, null).indicator, "waiting-for-input");
});

test("a draft never hides a question or a failure, nor an idle thread's unread or queued state", () => {
  assert.equal(resolveRowGlyph(thread("waiting-for-input", "x", { runtimeStatus: "active" }), true, null).indicator, "waiting-for-input");
  assert.equal(resolveRowGlyph(thread("unread-error", "x"), true, null).indicator, "unread-error");
  assert.equal(resolveRowGlyph(thread("unread-success", "x"), true, null).indicator, "unread-success");
  assert.equal(resolveRowGlyph(thread("queued-failed", "x"), true, null).indicator, "queued-failed");
});

test("a draft on a busy thread never hides a queued message that failed to send", () => {
  const glyph = resolveRowGlyph(thread("queued-failed", "Queued message failed to send", { runtimeStatus: "active" }), true, null);
  assert.equal(glyph.indicator, "queued-failed");
  assert.equal(glyph.label, "Queued message failed to send");
});

test("another plugin's row status replaces the draft and quiet states, with its own label", () => {
  assert.deepEqual(resolveRowGlyph(thread("none"), true, running), { indicator: "draft", rowStatus: running, label: "Syncing" });
  assert.deepEqual(resolveRowGlyph(thread("none"), false, running), { indicator: "none", rowStatus: running, label: "Syncing" });
  assert.equal(resolveRowGlyph(thread("unread-success", "x"), false, running).rowStatus, running);
});

test("a running turn, a question and an unread failure outrank a row status", () => {
  for (const indicator of ["runtime", "waiting-for-input", "unread-error"]) {
    const glyph = resolveRowGlyph(thread(indicator, "host"), false, running);
    assert.equal(glyph.rowStatus, null, indicator);
    assert.equal(glyph.label, "host", indicator);
  }
});

test("rollups draw bb glyphs, and the idle dot for done", () => {
  assert.equal(ROLLUP_GLYPH.input, "waiting-for-input");
  assert.equal(ROLLUP_GLYPH.error, "unread-error");
  assert.equal(ROLLUP_GLYPH.running, "runtime");
  assert.equal(ROLLUP_GLYPH.done, "none");
});

test("Reduce motion stops the glyph's animations outright; otherwise only the system preference does", () => {
  assert.match(glyphMotionClass(true), /^animate-none! \[&_\*\]:animate-none!$/);
  assert.doesNotMatch(glyphMotionClass(false), /(^| )animate-none/);
  assert.match(glyphMotionClass(false), /motion-reduce:\[&_\*\]:animate-none!/);
});

test("a failed queued message keeps bb's own glyph and label over the failed override", () => {
  assert.deepEqual(resolveRowGlyph(thread("queued-failed", "Queued message failed to send", { status: "error" }), false, null), {
    indicator: "queued-failed",
    rowStatus: null,
    label: "Queued message failed to send",
  });
});

test("an archived failed thread is drawn as bb draws it, without the failed override", () => {
  assert.deepEqual(resolveRowGlyph(thread("none", null, { status: "error", isArchived: true }), false, null), {
    indicator: "none",
    rowStatus: null,
    label: null,
  });
});

test("the Waiting rollup draws bb's queued-waiting glyph, not Done's idle dot", () => {
  assert.equal(ROLLUP_GLYPH.waiting, "queued-waiting");
  assert.notEqual(ROLLUP_GLYPH.waiting, ROLLUP_GLYPH.done);
});

test("another plugin's row status never covers a failed queued message", () => {
  assert.deepEqual(resolveRowGlyph(thread("queued-failed", "Queued message failed to send", { status: "error" }), false, running), {
    indicator: "queued-failed",
    rowStatus: null,
    label: "Queued message failed to send",
  });
});

test("a rolled-up subtree draws bb's glyph for its state and says it is a subthread's", () => {
  assert.deepEqual(rollupGlyph("unread"), { indicator: "unread-success", rowStatus: null, label: "Subthread finished, not read" });
  assert.equal(rollupGlyph("input").indicator, "waiting-for-input");
});
