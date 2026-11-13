import { test } from "node:test";
import assert from "node:assert/strict";
import { canStop, hoverActionsClass, rowHeightPx, stopsFromGlyph } from "../src/rowActions.ts";

const idle = { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 };
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
  assert.equal(stopsFromGlyph(t("active"), false), true);
  assert.equal(stopsFromGlyph(t("active"), true), false);
  assert.equal(stopsFromGlyph(t("idle"), false), false);
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
