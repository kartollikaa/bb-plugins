import assert from "node:assert/strict";
import { test } from "node:test";
import { fallFrame, gaitFrame, hopHeight, turnFrame } from "../lib/animation.ts";

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

test("both turn directions pass through a front-facing pose without flattening the profile", () => {
  for (const direction of [1, -1]) {
    assert.equal(turnFrame(direction, -direction, 0).yaw, direction);
    const middle = turnFrame(direction, -direction, .5);
    assert.equal(middle.yaw, 0);
    assert.equal(middle.profile, 0);
    assert.ok(middle.width >= .55);
    assert.equal(turnFrame(direction, -direction, 1).yaw, -direction);
  }
});

test("a drop inherits velocity on both axes and gravity returns it to the floor", () => {
  const still = fallFrame(140, 200, 0, 0, .04);
  const movingUp = fallFrame(140, 200, 0, 300, .04);
  const movingDownRight = fallFrame(140, 200, 180, -300, .04);
  assert.equal(movingUp.x, still.x);
  assert.ok(movingUp.lift > still.lift);
  assert.equal(movingDownRight.x, 200 + 180 * .04);
  assert.ok(movingDownRight.lift < still.lift);
  assert.equal(fallFrame(140, 200, 180, 300, .4).lift, 0);
  assert.deepEqual(fallFrame(140, 200, 180, 300, .4), fallFrame(140, 200, 180, 300, 1));
});
