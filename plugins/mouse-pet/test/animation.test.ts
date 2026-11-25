import assert from "node:assert/strict";
import { test } from "node:test";
import { gaitFrame, hopHeight } from "../lib/animation.ts";

test("all feet settle and the gait stops swinging the tail at rest", () => {
  for (const speed of [0, 15, 38, 150]) {
    const { feet, tail } = gaitFrame(.21, speed);
    assert.equal(feet.length, 4);
    assert.ok(feet.every(({ lift }) => lift >= 0));
    assert.equal(feet.some(({ lift }) => lift > 0), speed > 0);
    assert.equal(Math.abs(tail) > 0, speed > 0);
  }
});

test("a hop rises and falls between grounded anticipation and landing", () => {
  assert.equal(hopHeight(0), 0);
  assert.equal(hopHeight(.1), 0);
  assert.ok(hopHeight(.4) > hopHeight(.2));
  assert.ok(hopHeight(.6) > hopHeight(.8));
  assert.equal(hopHeight(.9), 0);
  assert.equal(hopHeight(1), 0);
});

test("a second hop starts at the current height and ends on the floor", () => {
  const height = hopHeight(.49);
  assert.equal(hopHeight(0, height), height);
  assert.ok(hopHeight(.14, height) > height);
  assert.equal(hopHeight(.9, height), 0);
});
