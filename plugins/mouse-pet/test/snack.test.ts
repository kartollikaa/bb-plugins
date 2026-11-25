import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceSnack, createSnack, interruptSnack } from "../lib/snack.ts";
import type { Pet } from "../lib/pet.ts";

const WIDTH = 800;
const nearEdge: Pet = { x: 1, direction: -1, velocity: -45, mode: "walk", idleView: "profile", remainingMs: 2_000 };
const away = { ...nearEdge, x: 200 };
const preferToEat = () => 0;

const fetchCheese = () => {
  const pickingUp = advanceSnack(createSnack(0), nearEdge, 12_000, WIDTH, preferToEat);
  return advanceSnack(pickingUp.snack, pickingUp.pet, 13_000, WIDTH, preferToEat);
};

test("only a pet at the edge can pull cheese into the window", () => {
  assert.equal(advanceSnack(createSnack(0), away, 12_000, WIDTH, preferToEat).snack.action, null);
  const fetching = advanceSnack(createSnack(0), nearEdge, 12_000, WIDTH, preferToEat);
  assert.equal(fetching.snack.action?.kind, "fetch");
  assert.equal(fetching.snack.cheese, null);
  const emerging = advanceSnack(fetching.snack, fetching.pet, 12_400, WIDTH, preferToEat);
  assert.ok(emerging.snack.cheese!.x < 0);
  const placed = fetchCheese();
  assert.equal(placed.snack.action, null);
  assert.ok(placed.snack.cheese!.x > 0);
  const otherEdge = { ...nearEdge, x: WIDTH - 48, direction: 1 as const };
  assert.equal(advanceSnack(placed.snack, otherEdge, 90_000, WIDTH, preferToEat).snack.cheese, placed.snack.cheese);
});

test("the pet leaves cheese alone after placing it and ignores the first later encounter", () => {
  const placed = fetchCheese();
  const contact = { ...nearEdge, x: 15 };
  const tooSoon = advanceSnack(placed.snack, contact, 16_000, WIDTH, preferToEat);
  assert.equal(tooSoon.snack.action, null);
  assert.equal(tooSoon.snack.visits, 0);
  const first = advanceSnack(placed.snack, contact, 22_000, WIDTH, preferToEat);
  assert.equal(first.snack.action, null);
  assert.equal(first.snack.visits, 1);
  assert.equal(advanceSnack(first.snack, contact, 25_000, WIDTH, preferToEat).snack.visits, 1);
  const left = advanceSnack(first.snack, away, 26_000, WIDTH, preferToEat);
  const eating = advanceSnack(left.snack, contact, 27_000, WIDTH, preferToEat);
  assert.equal(eating.snack.action?.kind, "eat");
  const partlyEaten = advanceSnack(eating.snack, eating.pet, 27_500, WIDTH, preferToEat);
  assert.equal(partlyEaten.snack.cheese?.bites, 1);
  const paused = interruptSnack(partlyEaten.snack, 27_500, WIDTH);
  assert.equal(paused.cheese?.bites, 1);
  assert.equal(paused.action, null);
  const finished = advanceSnack(eating.snack, eating.pet, 28_000, WIDTH, preferToEat);
  assert.equal(finished.snack.cheese, null);
  assert.equal(advanceSnack(finished.snack, nearEdge, 29_000, WIDTH, preferToEat).snack.action, null);
  assert.equal(advanceSnack(finished.snack, nearEdge, 40_000, WIDTH, preferToEat).snack.action?.kind, "fetch");
});
