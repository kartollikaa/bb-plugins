import { test } from "node:test";
import assert from "node:assert/strict";
import { canStop, END_SLOT_MIN_PX, HOVER_ACTIONS_STRIP_PX, hoverActionsClass, ROW_END_PAD_PX, rowHeightPx, stopsFromGlyph } from "../src/rowActions.ts";
import { HEADER_CHEVRON_MOTION, ROW_TINT } from "../src/rowStyles.ts";

const idle = { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 };
const leaf = { glyph: { indicator: "runtime", rowStatus: null } };
const t = (status: string, extra: { indicator?: string; activity?: typeof idle } = {}) => ({ status, indicator: "none", activity: idle, ...extra });

test("Stop is offered while work runs, including a stop the machine never confirmed, and not when idle", () => {
  assert.equal(canStop(t("active")), true);
  assert.equal(canStop(t("starting")), true);
  assert.equal(canStop(t("idle", { activity: { ...idle, backgroundAgents: 1 } })), true);
  assert.equal(canStop(t("idle", { indicator: "workflow" })), true);
  assert.equal(canStop(t("stopping")), true, "a stuck stopping thread can be stopped again");
  assert.equal(canStop(t("idle")), false);
  assert.equal(canStop(t("error")), false);
});

test("a parent row keeps its glyph as the fold toggle, so only a leaf row's glyph turns into Stop", () => {
  assert.equal(stopsFromGlyph(t("active"), { ...leaf, hasChildren: false, isCompactViewport: false }), true);
  assert.equal(stopsFromGlyph(t("active"), { ...leaf, hasChildren: true, isCompactViewport: false }), false);
  assert.equal(stopsFromGlyph(t("idle"), { ...leaf, hasChildren: false, isCompactViewport: false }), false);
});

test("on a touch-first compact viewport the glyph never stops a thread in one tap; Stop stays in the menus", () => {
  assert.equal(stopsFromGlyph(t("active"), { ...leaf, hasChildren: false, isCompactViewport: true }), false);
  assert.equal(canStop(t("active")), true);
});

test("compact viewports get taller rows than the fixed 32px", () => {
  assert.equal(rowHeightPx(false), 32);
  assert.ok(rowHeightPx(true) > 32);
});

test("hover actions appear at once on hover, keyboard focus or an open menu, fade in 80ms at most, and never resize the row", () => {
  for (const reduceMotion of [false, true]) {
    const classes = hoverActionsClass(reduceMotion).split(" ");
    assert.ok(classes.includes("invisible") && classes.includes("opacity-0"));
    for (const state of ["group-hover/row", "group-data-[keyboard-focus]/row", "group-data-[menu-open]/row"]) {
      assert.ok(classes.includes(`${state}:visible`) && classes.includes(`${state}:opacity-100`), state);
    }
    assert.equal(classes.some((c) => /delay/.test(c)), false);
    const duration = classes.map((c) => /^duration-(\d+)$/.exec(c)?.[1]).find(Boolean);
    assert.ok(duration === undefined || Number(duration) <= 80, `duration ${duration}`);
    assert.equal(classes.some((c) => /max-w|(^|:)w-|(^|:)hidden$|(^|:)flex$/.test(c)), false);
  }
  assert.ok(hoverActionsClass(true).includes("transition-none"));
});

test("Stop replaces only a glyph that shows running work, not a question, failure or another plugin's status", () => {
  const row = (indicator: string, rowStatus: { label: string } | null = null) => ({ glyph: { indicator, rowStatus }, hasChildren: false, isCompactViewport: false });
  for (const indicator of ["runtime", "background-agent", "background-command", "workflow", "working-draft"]) {
    assert.equal(stopsFromGlyph(t("active"), row(indicator)), true, indicator);
  }
  for (const indicator of ["waiting-for-input", "queued-failed", "unread-error", "draft", "none"]) {
    assert.equal(stopsFromGlyph(t("active"), row(indicator)), false, indicator);
  }
  assert.equal(stopsFromGlyph(t("active"), row("background-agent", { label: "Deploying" })), false);
});

test("the overlay lets clicks through to the row and its controls; only its own buttons catch them", () => {
  for (const reduceMotion of [false, true]) assert.ok(hoverActionsClass(reduceMotion).split(" ").includes("pointer-events-none"));
});

test("the provider and age slot reserves the button strip's width, so Archive and ⋯ never cover Retry, a PR icon, ⚠ or the badge", () => {
  assert.ok(END_SLOT_MIN_PX + ROW_END_PAD_PX >= HOVER_ACTIONS_STRIP_PX);
});

test("every state that shows the overlay also tints the row, so its solid end never sits on an untinted row", () => {
  const tint = ROW_TINT.split(" ");
  for (const state of ["hover", "data-[keyboard-focus]", "data-[menu-open]"]) {
    assert.ok(tint.includes(`${state}:bg-sidebar-accent/60`), state);
  }
});

test("a header chevron fades in within 80ms but keeps its 150ms fold rotation, and holds still under reduced motion", () => {
  assert.match(HEADER_CHEVRON_MOTION, /opacity_(\d+)ms/);
  assert.ok(Number(/opacity_(\d+)ms/.exec(HEADER_CHEVRON_MOTION)?.[1]) <= 80);
  assert.equal(/transform_(\d+)ms/.exec(HEADER_CHEVRON_MOTION)?.[1], "150");
  assert.ok(HEADER_CHEVRON_MOTION.split(" ").includes("motion-reduce:transition-none"));
});
