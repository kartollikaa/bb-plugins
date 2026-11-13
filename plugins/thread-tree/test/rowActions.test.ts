import { test } from "node:test";
import assert from "node:assert/strict";
import { canStop, hoverActionsClass, rowHeightPx, stopsFromGlyph } from "../src/rowActions.ts";

const idle = { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 };
const t = (status: string, extra: { indicator?: string; activity?: typeof idle } = {}) => ({ status, indicator: "none", activity: idle, ...extra });

test("Stop is offered while work runs, and not while it is already stopping or idle", () => {
  assert.equal(canStop(t("active")), true);
  assert.equal(canStop(t("starting")), true);
  assert.equal(canStop(t("idle", { activity: { ...idle, backgroundAgents: 1 } })), true);
  assert.equal(canStop(t("idle", { indicator: "workflow" })), true);
  assert.equal(canStop(t("stopping")), false);
  assert.equal(canStop(t("idle")), false);
  assert.equal(canStop(t("error")), false);
});

test("a parent row keeps its glyph as the fold toggle, so only a leaf row's glyph turns into Stop", () => {
  assert.equal(stopsFromGlyph(t("active"), false), true);
  assert.equal(stopsFromGlyph(t("active"), true), false);
  assert.equal(stopsFromGlyph(t("idle"), false), false);
});

test("compact viewports get taller rows than the fixed 32px", () => {
  assert.equal(rowHeightPx(false), 32);
  assert.ok(rowHeightPx(true) > 32);
});

test("hover actions appear after a 120ms delay on hover, at once for keyboard focus or an open menu, and never resize the row", () => {
  for (const reduceMotion of [false, true]) {
    const classes = hoverActionsClass(reduceMotion).split(" ");
    assert.ok(classes.includes("invisible") && classes.includes("opacity-0"));
    assert.ok(classes.includes("group-hover/row:delay-[120ms]"));
    assert.ok(classes.includes("group-data-[keyboard-focus]/row:visible") && classes.includes("group-data-[keyboard-focus]/row:delay-0"));
    assert.ok(classes.includes("group-data-[menu-open]/row:visible"));
    assert.equal(classes.some((c) => /max-w|(^|:)w-|(^|:)hidden$|(^|:)flex$/.test(c)), false);
  }
  assert.ok(hoverActionsClass(false).includes("transition-[opacity,visibility]"));
  assert.ok(hoverActionsClass(true).includes("duration-0"));
});
