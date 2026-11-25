import assert from "node:assert/strict";
import { test } from "node:test";
import { carryPosition, gripPoint, scruffPath, sniffDistance } from "../lib/interaction.ts";

test("the grip follows the cursor on both sides", () => {
  const point = { x: 300, y: 200 };
  assert.deepEqual(carryPosition(point, 1, 800, 600), { x: 271, lift: 378 });
  assert.deepEqual(carryPosition(point, -1, 800, 600), { x: 281, lift: 378 });
});

test("carry keeps the sprite inside the window", () => {
  assert.deepEqual(carryPosition({ x: 0, y: 0 }, 1, 800, 600), { x: 0, lift: 569 });
  assert.deepEqual(carryPosition({ x: 800, y: 600 }, -1, 800, 600), { x: 752, lift: 0 });
  assert.deepEqual(carryPosition({ x: 5, y: 5 }, 1, 15, 15), { x: 0, lift: 0 });
});

test("the scruff stays pinned while its connection to the body follows the actual movement", () => {
  const still = scruffPath(-27, { x: .94, y: 1.12 }, { x: 0, y: 0 });
  const trailing = scruffPath(-34, { x: .94, y: 1.2 }, { x: -7, y: 3 });
  assert.notEqual(still, trailing);
  assert.match(still, /^M29 9.* 29 9Z$/);
  assert.match(trailing, /^M29 9.* 29 9Z$/);
});

test("drag tracks the first movement without snapping from the pressed point to the scruff", () => {
  const offset = { x: -4, y: 5 };
  assert.deepEqual(gripPoint({ x: 200, y: 180 }, offset, 0), { x: 196, y: 185 });
  assert.deepEqual(gripPoint({ x: 206, y: 183 }, offset, 0), { x: 202, y: 188 });
  const settled = gripPoint({ x: 206, y: 183 }, offset, 150);
  assert.ok(Math.abs(settled.x - 206) < .03);
  assert.ok(Math.abs(settled.y - 183) < .03);
});

test("the mouse only approaches a nearby cursor ahead of its nose and close to the floor", () => {
  assert.equal(sniffDistance(100, 1, { x: 160, y: 588 }, 600), 15);
  assert.equal(sniffDistance(100, -1, { x: 88, y: 588 }, 600), 15);
  assert.equal(sniffDistance(100, -1, { x: 160, y: 588 }, 600), null);
  assert.equal(sniffDistance(100, 1, { x: 200, y: 588 }, 600), null);
  assert.equal(sniffDistance(100, 1, { x: 160, y: 550 }, 600), null);
});
