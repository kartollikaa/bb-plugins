import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advance,
  createPet,
  fit,
  isMoving,
  maxX,
  MAX_FRAME_MS,
  PET_WIDTH,
  startle,
  type Pet,
  type PetMode,
} from "../lib/pet.ts";

const VIEWPORT = 800;
const constant = (value: number) => () => value;
const pet = (overrides: Partial<Pet> = {}): Pet => ({
  x: 100,
  direction: 1,
  mode: "walk",
  remainingMs: 5_000,
  ...overrides,
});

test("a walking pet moves in its direction", () => {
  const next = advance(pet({ mode: "walk" }), 50, VIEWPORT, constant(0));
  assert.ok(next.x > 100);
  assert.equal(next.direction, 1);
});

test("running is faster than walking", () => {
  const walked = advance(pet({ mode: "walk" }), 50, VIEWPORT, constant(0)).x;
  const ran = advance(pet({ mode: "run" }), 50, VIEWPORT, constant(0)).x;
  assert.ok(ran - 100 > (walked - 100) * 2);
});

test("a resting pet stays put", () => {
  for (const mode of ["sit", "groom", "sleep"] as PetMode[]) {
    assert.equal(isMoving(mode), false);
    assert.equal(advance(pet({ mode }), 50, VIEWPORT, constant(0)).x, 100);
  }
});

test("it turns around at the right edge and stays inside", () => {
  const edge = maxX(VIEWPORT);
  const next = advance(pet({ mode: "run", x: edge - 1, direction: 1 }), 100, VIEWPORT, constant(0));
  assert.equal(next.x, edge);
  assert.equal(next.direction, -1);
});

test("it turns around at the left edge", () => {
  const next = advance(pet({ mode: "run", x: 1, direction: -1 }), 100, VIEWPORT, constant(0));
  assert.equal(next.x, 0);
  assert.equal(next.direction, 1);
});

test("a long pause between frames moves it no further than one capped frame", () => {
  const next = advance(pet({ mode: "run", x: 100 }), 60_000, VIEWPORT, constant(0));
  assert.ok(next.x - 100 <= (150 * MAX_FRAME_MS) / 1000 + 0.001);
});

test("a negative delta never moves it backwards", () => {
  assert.equal(advance(pet({ mode: "run" }), -500, VIEWPORT, constant(0)).x, 100);
});

test("a moving pet that runs out of time picks the next mode by weight", () => {
  const expected: Array<[number, PetMode]> = [
    [0, "walk"],
    [0.3, "run"],
    [0.6, "sit"],
    [0.8, "groom"],
    [0.95, "sleep"],
  ];
  for (const [roll, mode] of expected) {
    const sequence = [roll, 0.99, 0.5];
    const random = () => sequence.shift() ?? 0.5;
    const next = advance(pet({ mode: "walk", remainingMs: 1 }), 10, VIEWPORT, random);
    assert.equal(next.mode, mode, `roll ${roll}`);
    assert.ok(next.remainingMs > 0);
  }
});

test("a resting pet always gets up and moves", () => {
  for (const roll of [0, 0.5, 0.99]) {
    const next = advance(pet({ mode: "sleep", remainingMs: 1 }), 10, VIEWPORT, constant(roll));
    assert.ok(isMoving(next.mode), `roll ${roll}`);
  }
});

test("a new mode may flip the direction", () => {
  const rolls = [0, 0, 0.1];
  const random = () => rolls.shift() ?? 0;
  const next = advance(pet({ mode: "walk", direction: 1, remainingMs: 1 }), 10, VIEWPORT, random);
  assert.equal(next.direction, -1);
});

test("resting never flips the direction", () => {
  const rolls = [0.85, 0, 0];
  const random = () => rolls.shift() ?? 0;
  const next = advance(pet({ mode: "walk", direction: 1, remainingMs: 1 }), 10, VIEWPORT, random);
  assert.equal(next.mode, "groom");
  assert.equal(next.direction, 1);
});

test("a click makes it run the other way", () => {
  const scared = startle(pet({ mode: "sleep", direction: 1 }));
  assert.equal(scared.mode, "run");
  assert.equal(scared.direction, -1);
  assert.ok(scared.remainingMs > 0);
});

test("a new pet starts inside the window", () => {
  for (const roll of [0, 0.5, 0.999]) {
    const created = createPet(VIEWPORT, constant(roll));
    assert.ok(created.x >= 0 && created.x <= VIEWPORT - PET_WIDTH);
  }
});

test("a window narrower than the pet pins it to the left", () => {
  assert.equal(maxX(10), 0);
  assert.equal(advance(pet({ mode: "run", x: 0 }), 50, 10, constant(0)).x, 0);
});

test("fit pulls a pet back after the window shrinks", () => {
  assert.equal(fit(pet({ x: 700 }), 400).x, maxX(400));
  assert.equal(fit(pet({ x: 50 }), 400).x, 50);
});
