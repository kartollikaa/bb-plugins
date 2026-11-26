import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anchorPaw, blendGaitStyle, fallFrame, followSpring, gaitFrame, hopCompression, hopHeight, HOP_TOUCHDOWN,
  nextMoveVariant, pounceHeight, sleepBreath, strideLength, turnFrame,
} from "../lib/animation.ts";
import type { PawPlant } from "../lib/animation.ts";
import { advance, type Pet } from "../lib/pet.ts";

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
  for (const [index, phase] of [0, .75, .5, .25].entries()) {
    assert.deepEqual(feet[index], gaitFrame(phase, 38).feet[0]);
  }
});

test("each gait and sleeping breath has four variants without an immediate repeat", () => {
  const variants = [0, 1, 2, 3] as const;
  const styles = variants.map((variant) => blendGaitStyle({ lift: 1, tail: 1, bob: 1 }, variant, 300));
  for (const speed of [38, 150]) {
    assert.equal(new Set(styles.map((style) => JSON.stringify(gaitFrame(.32, speed, 1, style)))).size, 4);
    for (let i = 0; i < 100; i++) {
      const ground = (style: typeof styles[number]) =>
        gaitFrame(i / 100, speed, 1, style).feet.map(({ lift }) => lift === 0);
      assert.ok(styles.every((style) => String(ground(style)) === String(ground(styles[0]))));
    }
  }
  assert.equal(new Set(variants.map((variant) => sleepBreath(900, 1, variant))).size, 4);
  for (const variant of variants) {
    const choices = [0, .45, .9].map((roll) => nextMoveVariant(variant, roll));
    assert.equal(new Set(choices).size, 3);
    assert.ok(!choices.includes(variant));
  }
});

test("the faster gait alternates diagonal pairs with a small symmetrical rise", () => {
  for (let i = 0; i < 100; i++) {
    const { feet, bob } = gaitFrame(i / 100, 150);
    assert.ok(Math.abs(feet[0].lift - feet[3].lift) < 1e-8);
    assert.ok(Math.abs(feet[1].lift - feet[2].lift) < 1e-8);
    assert.ok(feet.filter((foot) => foot.lift === 0).length >= 2);
    assert.ok(bob < 1);
  }
});

test("a loaded foreground mouse plants paws in the same room coordinates", () => {
  for (const direction of [-1, 1]) {
    const pace = .48;
    const scale = 1.23;
    const dx = direction * 2;
    const speed = 38;
    const foot = (x: number, phase: number) => x + direction * scale * gaitFrame(phase, speed, pace).feet[0].reach;
    const start = foot(100, .1);
    const next = foot(100 + dx, .1 + (dx * direction) / strideLength(speed, pace, scale));
    assert.ok(Math.abs(start - next) < 1e-8);
  }
});

test("support stays anchored through acceleration and braking, then releases in swing", () => {
  for (const direction of [-1, 1] as const) {
    let pet: Pet = { x: 400, mode: "run", direction, velocity: 38 * direction, idleView: "profile", remainingMs: 20_000 };
    let filtered = 38;
    let phase = .36;
    let plants: PawPlant[] = [];
    let targets: number[] = [];
    let anchoredFrames = 0;
    let bareSlide = 0;
    for (let frame = 0; frame < 34; frame++) {
      if (frame === 15) pet.mode = "sit";
      const previous = pet.x;
      pet = advance(pet, 16, 1_000, () => 0);
      const distance = (pet.x - previous) * direction;
      filtered += (distance / .016 - filtered) * (1 - Math.exp(-16 / 44));
      phase = (phase + distance / strideLength(filtered)) % 1;
      const { feet } = gaitFrame(phase, filtered);
      feet.forEach((foot, index) => {
        const localX = 5 + foot.reach;
        const support = foot.lift === 0 && filtered > 9;
        const prior = plants[index];
        const target = pet.x + localX * direction;
        const plant = anchorPaw(prior, localX, pet.x, direction, support, 16);
        if (support && prior?.supportX != null) {
          assert.ok(Math.abs(plant.supportX! - prior.supportX) < 1e-8);
          bareSlide = Math.max(bareSlide, Math.abs(target - targets[index]));
          anchoredFrames++;
        }
        if (!support) {
          assert.equal(plant.supportX, null);
          assert.ok(Math.abs(plant.correction) <= Math.abs(prior?.correction ?? 0));
        }
        targets[index] = target;
        plants[index] = plant;
      });
    }
    assert.ok(anchoredFrames > 30 && bareSlide > .75);
  }
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

test("a small solo hop has less lift and only compresses on landing", () => {
  assert.ok(hopHeight(.42, 0, .58) < hopHeight(.42, 0, .85));
  assert.equal(hopCompression(HOP_TOUCHDOWN - .01, .58), 0);
  assert.ok(hopCompression(.94, .58) > 0);
  assert.equal(hopCompression(1, .58), 0);
});

test("a pounce can perch at the cheese height before stepping down to the floor", () => {
  assert.equal(pounceHeight(0, 700, 18), 0);
  assert.equal(pounceHeight(420, 700, 18), 18);
  assert.equal(pounceHeight(625, 700, 18), 9);
  assert.equal(pounceHeight(700, 700, 18), 0);
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
