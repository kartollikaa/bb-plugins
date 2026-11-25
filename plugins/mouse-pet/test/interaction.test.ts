import assert from "node:assert/strict";
import { test } from "node:test";
import { carryPosition, sniffDistance } from "../lib/interaction.ts";

test("the grip follows the cursor on both sides", () => {
  const point = { x: 300, y: 200 };
  assert.deepEqual(carryPosition(point, 1, 800, 600), { x: 267, lift: 373 });
  assert.deepEqual(carryPosition(point, -1, 800, 600), { x: 285, lift: 373 });
});

test("carry keeps the sprite inside the window", () => {
  assert.deepEqual(carryPosition({ x: 0, y: 0 }, 1, 800, 600), { x: 0, lift: 569 });
  assert.deepEqual(carryPosition({ x: 800, y: 600 }, -1, 800, 600), { x: 752, lift: 0 });
  assert.deepEqual(carryPosition({ x: 5, y: 5 }, 1, 15, 15), { x: 0, lift: 0 });
});

test("the mouse only approaches a nearby cursor ahead of its nose and close to the floor", () => {
  assert.equal(sniffDistance(100, 1, { x: 160, y: 588 }, 600), 15);
  assert.equal(sniffDistance(100, -1, { x: 88, y: 588 }, 600), 15);
  assert.equal(sniffDistance(100, -1, { x: 160, y: 588 }, 600), null);
  assert.equal(sniffDistance(100, 1, { x: 200, y: 588 }, 600), null);
  assert.equal(sniffDistance(100, 1, { x: 160, y: 550 }, 600), null);
});
