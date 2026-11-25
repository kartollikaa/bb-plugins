import assert from "node:assert/strict";
import { test } from "node:test";
import { fallFrame, followSpring, gaitFrame, hopHeight, strideLength, turnFrame } from "../lib/animation.ts";

test("all feet settle and the gait stops swinging the tail at rest", () => {
  for (const speed of [0, 15, 38, 150]) {
    const { feet, tail } = gaitFrame(.21, speed);
    assert.equal(feet.length, 4);
    assert.ok(feet.every(({ lift }) => lift >= 0));
    assert.equal(feet.some(({ lift }) => lift > 0), speed > 0);
    assert.equal(Math.abs(tail) > 0, speed > 0);
  }
});

test("a grounded paw stays put in the room while the body walks over it", () => {
  for (const speed of [38, 150]) {
    const first = gaitFrame(.1, speed).feet[0];
    const second = gaitFrame(.2, speed).feet[0];
    assert.equal(first.lift, 0);
    assert.equal(second.lift, 0);
    assert.ok(Math.abs(second.reach - first.reach + .1 * strideLength(speed)) < .0001);
    assert.ok(gaitFrame(.82, speed).feet[0].lift > 0);
  }
});

test("walking advances each paw through the same motion one quarter-cycle apart", () => {
  const feet = gaitFrame(0, 38).feet;
  for (const [index, foot] of feet.entries()) {
    assert.deepEqual(foot, gaitFrame(index / 4, 38).feet[0]);
  }
});

test("a sprint has a single raised bound between hind push-off and front landing", () => {
  assert.equal(gaitFrame(.42, 38).bound, 0);
  const flight = gaitFrame(.42, 150);
  assert.ok(flight.bound > 3 && flight.feet.every(({ lift }) => lift > 0));
  const landing = gaitFrame(.56, 150);
  assert.ok(landing.bound < flight.bound);
  assert.equal(landing.feet[1].lift, 0);
  assert.equal(landing.feet[3].lift, 0);
  assert.ok(gaitFrame(.84, 150).bound < .01);
  assert.ok(strideLength(150) / 150 > .3);
});

test("a click hop lifts on the first frame and returns to the floor", () => {
  assert.equal(hopHeight(0), 0);
  assert.ok(hopHeight(1 / 60 / .42) > 3);
  assert.ok(hopHeight(.4) > hopHeight(.2));
  assert.ok(hopHeight(.49) > 21);
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

test("the carried body trails the grip and returns gradually after the cursor stops", () => {
  let body = { value: 0, velocity: 0 };
  body = followSpring(body, -7, 16);
  assert.ok(body.value < 0 && body.value > -7);
  for (let index = 0; index < 12; index++) body = followSpring(body, -7, 16);
  const lag = body.value;
  body = followSpring(body, 0, 16);
  assert.ok(body.value < 0 && Math.abs(body.value - lag) < 2);
  for (let index = 0; index < 45; index++) body = followSpring(body, 0, 16);
  assert.ok(Math.abs(body.value) < .05);
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
  assert.equal(fallFrame(3, 200, 900, 0, .001).x, 200.9);
  assert.ok(fallFrame(3, 200, 900, 0, .033).x > 229);
});
