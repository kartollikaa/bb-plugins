import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceSnack, CHEESE_WIDTH, createSnack, interruptSnack, resizeSnack } from "../lib/snack.ts";
import type { Pet } from "../lib/pet.ts";

const WIDTH = 800;
const nearEdge: Pet = { x: 1, direction: -1, velocity: -45, mode: "walk", idleView: "profile", remainingMs: 2_000 };
const away = { ...nearEdge, x: 200 };
const preferToEat = () => 0;

const fetchCheese = () => {
  const pickingUp = advanceSnack(createSnack(0), nearEdge, 12_000, WIDTH, preferToEat);
  return advanceSnack(pickingUp.snack, pickingUp.pet, 15_000, WIDTH, preferToEat);
};

test("only a pet at the edge can pull cheese into the window", () => {
  assert.equal(advanceSnack(createSnack(0), away, 12_000, WIDTH, preferToEat).snack.action, null);
  const fetching = advanceSnack(createSnack(0), nearEdge, 12_000, WIDTH, preferToEat);
  assert.equal(fetching.snack.action?.kind, "fetch");
  assert.equal(fetching.snack.cheese, null);
  const emerging = advanceSnack(fetching.snack, fetching.pet, 12_570, WIDTH, preferToEat);
  assert.ok(emerging.snack.cheese!.x < 0);
  const placed = fetchCheese();
  assert.equal(placed.snack.action, null);
  assert.ok(placed.snack.cheese!.x > 0);
  const otherEdge = { ...nearEdge, x: WIDTH - 48, direction: 1 as const };
  const passing = advanceSnack(placed.snack, otherEdge, 90_000, WIDTH, () => .99);
  assert.equal(passing.snack.cheese?.x, placed.snack.cheese?.x);
  assert.equal(passing.snack.action, null);
});

test("the pet picks a random pull distance that keeps both the cheese and mouse inside", () => {
  const placement = (width: number, roll: number, direction: -1 | 1) => {
    const atEdge = direction === -1 ? nearEdge : { ...nearEdge, x: width - 48, direction };
    const draw = () => roll;
    const fetching = advanceSnack(createSnack(0), atEdge, 12_000, width, draw);
    return advanceSnack(fetching.snack, fetching.pet, 15_000, width, draw);
  };
  assert.ok(placement(WIDTH, .95, -1).snack.cheese!.x > placement(WIDTH, .05, -1).snack.cheese!.x + 40);
  assert.ok(placement(WIDTH, .95, 1).snack.cheese!.x < placement(WIDTH, .05, 1).snack.cheese!.x - 40);
  for (const direction of [-1, 1] as const) {
    const placed = placement(120, .98, direction);
    assert.ok(placed.pet.x >= 0 && placed.pet.x + 48 <= 120);
    assert.ok(placed.snack.cheese!.x >= 0 && placed.snack.cheese!.x + CHEESE_WIDTH <= 120);
  }
});

test("cheese never interrupts sleep, a waking stretch, grooming or perching", () => {
  const snack = createSnack(0);
  for (const mode of ["sleep", "stretch", "groom", "perch"] as const) {
    const resting = { ...nearEdge, mode };
    const next = advanceSnack(snack, resting, 15_000, WIDTH, preferToEat);
    assert.equal(next.snack.action, null);
    assert.equal(next.pet, resting);
  }
});

test("the mouse can finish cheese from either side after the window shrinks", () => {
  for (const direction of [-1, 1] as const) {
    const atEdge = direction === -1 ? nearEdge : { ...nearEdge, x: WIDTH - 48, direction };
    const distant = () => .99;
    const fetch = advanceSnack(createSnack(0), atEdge, 12_000, WIDTH, distant);
    const placed = advanceSnack(fetch.snack, fetch.pet, 15_000, WIDTH, distant);
    const fitted = resizeSnack(placed.snack, 24_000, 120);
    const cheese = fitted.cheese!;
    const mouth = cheese.x + (direction === -1 ? CHEESE_WIDTH - 4 : 4);
    const x = mouth - (direction === -1 ? 3 : 45);
    assert.ok(x >= 0 && x + 48 <= 120);
    assert.ok(cheese.x >= 0 && cheese.x + CHEESE_WIDTH <= 120);
    const approaching = { ...nearEdge, x, direction };
    const first = advanceSnack(fitted, approaching, 24_100, 120, preferToEat);
    const away = { ...approaching, x: x === 0 ? 72 : 0 };
    const left = advanceSnack(first.snack, away, 24_500, 120, () => .99);
    const eating = advanceSnack(left.snack, approaching, 25_000, 120, preferToEat);
    const done = advanceSnack(eating.snack, eating.pet, 26_300, 120, preferToEat);
    assert.equal(eating.snack.action?.kind, "eat");
    assert.equal(done.snack.cheese, null);
  }
});

test("the mouse can notice cheese across a wide window and run there after a pause", () => {
  const width = 2_000;
  const fetching = advanceSnack(createSnack(0), nearEdge, 12_000, width, preferToEat);
  const placed = advanceSnack(fetching.snack, fetching.pet, 15_000, width, preferToEat);
  const farAway = { ...away, x: 1_800 };
  assert.equal(advanceSnack(placed.snack, farAway, 22_999, width, preferToEat).snack.action, null);
  const ignored = advanceSnack(placed.snack, farAway, 23_000, width, () => .99);
  assert.equal(ignored.snack.action, null);
  assert.equal(advanceSnack(ignored.snack, farAway, 24_000, width, preferToEat).snack.action, null);

  let next = advanceSnack(ignored.snack, farAway, 27_000, width, () => .4);
  assert.equal(next.snack.action?.kind, "seek");
  let ran = false;
  for (let time = 27_016; time <= 40_000 && next.snack.action?.kind === "seek"; time += 16) {
    next = advanceSnack(next.snack, next.pet, time, width, preferToEat);
    ran ||= next.pet.mode === "run";
  }
  assert.ok(ran);
  assert.equal(next.snack.action?.kind, "eat");
  assert.equal(next.pet.direction, -1);
  assert.ok(next.pet.x < 150);
});

test("the pet leaves cheese alone after placing it and ignores the first later encounter", () => {
  const placed = fetchCheese();
  const contact = { ...nearEdge, x: placed.snack.cheese!.x + CHEESE_WIDTH - 7 };
  const tooSoon = advanceSnack(placed.snack, contact, 16_000, WIDTH, preferToEat);
  assert.equal(tooSoon.snack.action, null);
  assert.equal(tooSoon.snack.visits, 0);
  const first = advanceSnack(placed.snack, contact, 24_000, WIDTH, preferToEat);
  assert.equal(first.snack.action, null);
  assert.equal(first.snack.visits, 1);
  assert.equal(advanceSnack(first.snack, contact, 25_000, WIDTH, preferToEat).snack.visits, 1);
  const left = advanceSnack(first.snack, away, 26_000, WIDTH, () => .99);
  const eating = advanceSnack(left.snack, contact, 27_000, WIDTH, preferToEat);
  assert.equal(eating.snack.action?.kind, "eat");
  const partlyEaten = advanceSnack(eating.snack, eating.pet, 27_500, WIDTH, preferToEat);
  assert.equal(partlyEaten.snack.cheese?.bites, 1);
  const paused = interruptSnack(partlyEaten.snack, 27_500, WIDTH);
  assert.equal(paused.cheese?.bites, 1);
  assert.equal(paused.action, null);
  const anotherBite = advanceSnack(eating.snack, eating.pet, 28_050, WIDTH, preferToEat);
  assert.equal(anotherBite.snack.cheese?.bites, 3);
  assert.equal(anotherBite.snack.cheese?.x, placed.snack.cheese?.x);
  const finished = advanceSnack(eating.snack, eating.pet, 28_300, WIDTH, preferToEat);
  assert.equal(finished.snack.cheese, null);
  assert.equal(advanceSnack(finished.snack, nearEdge, 29_000, WIDTH, preferToEat).snack.action, null);
  assert.equal(advanceSnack(finished.snack, nearEdge, 41_000, WIDTH, preferToEat).snack.action?.kind, "fetch");
});
