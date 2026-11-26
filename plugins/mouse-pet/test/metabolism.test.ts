import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceMetabolism, BURST_FULLNESS, createMetabolism, hunger } from "../lib/metabolism.ts";

test("a completed bite satisfies hunger while the belly grows gradually", () => {
  const initial = createMetabolism();
  const fed = advanceMetabolism(initial, 0, 0, 0, 1);
  assert.ok(fed.fullness > initial.fullness);
  assert.ok(hunger(fed) < hunger(initial));
  assert.equal(fed.belly, initial.belly);
  const digesting = advanceMetabolism(fed, 1_000, 0, 0, 0);
  assert.ok(digesting.belly > fed.belly && digesting.belly < digesting.fullness);
});

test("time and physical activity deplete reserves at different rates", () => {
  const fed = advanceMetabolism(createMetabolism(), 0, 0, 0, 6);
  const resting = advanceMetabolism(fed, 10_000, 0, 0, 0);
  const grooming = advanceMetabolism(fed, 10_000, 0, 10_000, 0);
  const walking = advanceMetabolism(fed, 10_000, 380, 0, 0);
  const running = advanceMetabolism(fed, 10_000, 1_500, 0, 0);
  assert.ok(resting.fullness < fed.fullness);
  assert.ok(grooming.fullness < resting.fullness);
  assert.ok(running.fullness < walking.fullness && walking.fullness < resting.fullness);
  assert.ok(hunger(running) > hunger(resting) && hunger(resting) > hunger(fed));
  const depleted = advanceMetabolism(running, 999_000, 0, 0, 0);
  assert.equal(depleted.fullness, 0);
  assert.equal(hunger(depleted), 1);
});

test("closely spaced meals cross the burst threshold only if excess weight remains", () => {
  const afterCheese = advanceMetabolism(createMetabolism(), 0, 0, 0, 8);
  assert.ok(afterCheese.fullness < BURST_FULLNESS);
  assert.ok(advanceMetabolism(afterCheese, 20_000, 0, 0, 4).fullness >= BURST_FULLNESS);
  assert.ok(advanceMetabolism(afterCheese, 20_000, 2_800, 0, 4).fullness < BURST_FULLNESS);
});
