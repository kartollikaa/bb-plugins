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
  SKID_MS,
  startle,
  type Pet,
  type PetMode,
} from "../lib/pet.ts";

const VIEWPORT = 800;
const constant = (value: number) => () => value;
const pet = (overrides: Partial<Pet> = {}): Pet => ({
  x: 100,
  velocity: 0,
  direction: 1,
  idleView: "profile",
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
  const walked = advance(pet({ mode: "walk", velocity: 38 }), 50, VIEWPORT, constant(0)).x;
  const ran = advance(pet({ mode: "run", velocity: 150 }), 50, VIEWPORT, constant(0)).x;
  assert.ok(ran - 100 > (walked - 100) * 2);
});

test("speed builds from a standing start and settles before a rest", () => {
  const accelerating = advance(pet({ mode: "run" }), 16, VIEWPORT, constant(0));
  assert.ok(accelerating.velocity > 0 && accelerating.velocity < 38);
  const stopping = advance(pet({ mode: "sit", velocity: 80 }), 16, VIEWPORT, constant(0));
  assert.ok(stopping.x > 100 && stopping.velocity < 80);
  const stopped = advance(stopping, 100, VIEWPORT, constant(0));
  assert.equal(stopped.velocity, 0);
  assert.equal(advance(stopped, 100, VIEWPORT, constant(0)).x, stopped.x);
});

test("a resting pet stays put", () => {
  for (const mode of ["sit", "groom", "sleep"] as PetMode[]) {
    assert.equal(isMoving(mode), false);
    assert.equal(advance(pet({ mode }), 50, VIEWPORT, constant(0)).x, 100);
  }
});

test("a sprint brakes before either edge and only turns after the skid", () => {
  for (const direction of [-1, 1] as const) {
    const edge = direction === 1 ? maxX(VIEWPORT) : 0;
    let next = advance(pet({ mode: "run", x: edge - direction * 20, velocity: direction * 150, direction }), 40, VIEWPORT, constant(0));
    assert.equal(next.mode, "skid");
    const firstDistance = Math.abs(next.x - edge);
    assert.ok(firstDistance > 0);
    next = advance(next, 100, VIEWPORT, constant(0));
    assert.equal(next.direction, direction);
    assert.ok(Math.abs(next.x - edge) < firstDistance);
    for (let elapsed = 100; elapsed < SKID_MS; elapsed += 100) {
      next = advance(next, 100, VIEWPORT, constant(0));
    }
    assert.equal(next.x, edge);
    assert.equal(next.mode, "run");
    assert.equal(next.direction, -direction);
  }
});

test("a walking pet turns immediately at the edge", () => {
  const next = advance(pet({ x: 1, direction: -1 }), 100, VIEWPORT, constant(0));
  assert.equal(next.x, 0);
  assert.equal(next.mode, "walk");
  assert.equal(next.direction, 1);
});

test("a sprint that enters a skid before reaching full speed never speeds up while braking", () => {
  const edge = maxX(VIEWPORT);
  let next = advance(pet({ mode: "run", x: edge - 19 }), 90, VIEWPORT, constant(0));
  assert.equal(next.mode, "skid");
  for (let elapsed = 0; elapsed < SKID_MS; elapsed += 16) {
    const slower = advance(next, 16, VIEWPORT, constant(0));
    assert.ok(Math.abs(slower.velocity) <= Math.abs(next.velocity));
    assert.ok(slower.x >= next.x && slower.x <= edge);
    next = slower;
  }
  assert.equal(next.direction, -1);
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
    [0.7, "perch"],
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

test("a sitting pet always gets up and moves", () => {
  for (const roll of [0, 0.5, 0.99]) {
    const next = advance(pet({ mode: "sit", remainingMs: 1 }), 10, VIEWPORT, constant(roll));
    assert.ok(isMoving(next.mode), `roll ${roll}`);
  }
});

test("a sit can face forward, away, or along the floor", () => {
  for (const [roll, view] of [[.1, "profile"], [.4, "front"], [.8, "back"]] as const) {
    const sequence = [.6, .5, roll];
    const resting = advance(pet({ remainingMs: 1 }), 16, VIEWPORT, () => sequence.shift() ?? .5);
    assert.equal(resting.mode, "sit");
    assert.equal(resting.idleView, view);
    const moving = advance({ ...resting, remainingMs: 1 }, 16, VIEWPORT, constant(.5));
    assert.equal(moving.idleView, "profile");
  }
});

test("a perch stays on the floor before resuming movement", () => {
  const perched = advance(pet({ mode: "perch", remainingMs: 300 }), 100, VIEWPORT, constant(.5));
  assert.equal(perched.x, 100);
  assert.equal(perched.mode, "perch");
  assert.equal(advance({ ...perched, remainingMs: 1 }, 16, VIEWPORT, constant(.5)).mode, "walk");
});

test("the pet stretches after sleeping and wakes into a walk", () => {
  const stretched = advance(pet({ mode: "sleep", remainingMs: 1 }), 10, VIEWPORT, constant(0));
  assert.equal(stretched.mode, "stretch");
  assert.equal(stretched.x, 100);
  const awake = advance({ ...stretched, remainingMs: 1 }, 10, VIEWPORT, constant(0));
  assert.equal(awake.mode, "walk");
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
  assert.equal(scared.velocity, -150);
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
  const next = advance(pet({ mode: "run", x: 0, direction: -1 }), 50, 10, constant(0));
  assert.equal(next.x, 0);
  assert.equal(next.direction, -1);
});

test("fit pulls a pet back after the window shrinks", () => {
  assert.equal(fit(pet({ x: 700 }), 400).x, maxX(400));
  assert.equal(fit(pet({ x: 50 }), 400).x, 50);
});
