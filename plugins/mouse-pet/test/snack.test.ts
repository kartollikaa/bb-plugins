import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceSnack, biteMaskPath, cheeseLanding, CHEESE_WIDTH, createSnack, interruptSnack, resizeSnack } from "../lib/snack.ts";
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
  for (const mode of ["sleep", "stretch", "groom", "scratch", "perch"] as const) {
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
    const fed = advanceSnack(eating.snack, eating.pet, 26_300, 120, preferToEat);
    assert.equal(eating.snack.action?.kind, "eat");
    assert.equal(fed.snack.cheese?.bites, 2);
    assert.equal(fed.snack.action, null);
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
  const partlyEaten = advanceSnack(eating.snack, eating.pet, 27_550, WIDTH, preferToEat);
  assert.equal(partlyEaten.snack.cheese?.bites, 1);
  assert.equal(partlyEaten.bitesTaken, 1);
  assert.equal(advanceSnack(partlyEaten.snack, partlyEaten.pet, 27_560, WIDTH, preferToEat).bitesTaken, 0);
  const paused = interruptSnack(partlyEaten.snack, 27_550, WIDTH);
  assert.equal(paused.cheese?.bites, 1);
  assert.equal(paused.action, null);
  const anotherBite = advanceSnack(eating.snack, eating.pet, 28_050, WIDTH, preferToEat);
  assert.equal(anotherBite.snack.cheese?.bites, 2);
  assert.equal(anotherBite.snack.cheese?.x, placed.snack.cheese?.x);
  assert.equal(anotherBite.snack.action, null);
  assert.equal(advanceSnack(anotherBite.snack, away, 29_000, WIDTH, preferToEat).snack.action, null);
});

test("a large piece lasts four visits and each bite exposes a different fixed-size mask", () => {
  assert.equal(biteMaskPath(0), "");
  assert.equal(new Set([1, 2, 3, 4, 5, 6, 7].map(biteMaskPath)).size, 7);
  let next = fetchCheese();
  let time = 24_000;
  for (let visit = 1; visit <= 4; visit++) {
    next = advanceSnack(next.snack, away, time, WIDTH, preferToEat);
    assert.equal(next.snack.action?.kind, "seek");
    const deadline = time + 6_000;
    while (next.snack.action?.kind === "seek" && time < deadline) {
      time += 16;
      next = advanceSnack(next.snack, next.pet, time, WIDTH, preferToEat);
    }
    assert.equal(next.snack.action?.kind, "eat");
    time += 1_100;
    next = advanceSnack(next.snack, next.pet, time, WIDTH, preferToEat);
    assert.equal(next.snack.action, null);
    assert.equal(next.bitesTaken, 2);
    assert.equal(next.snack.cheese?.bites, visit < 4 ? visit * 2 : undefined);
    time += 6_000;
  }
  assert.equal(next.snack.cheese, null);
  assert.equal(advanceSnack(next.snack, nearEdge, time, WIDTH, preferToEat).snack.action, null);
  assert.equal(advanceSnack(next.snack, nearEdge, time + 12_000, WIDTH, preferToEat).snack.action?.kind, "fetch");
});

test("the mouse pushes or pounces on cheese, moves it, and leaves the bites untouched", () => {
  for (const [roll, kind] of [[.8, "push"], [.9, "pounce"]] as const) {
    const placed = fetchCheese();
    const cheese = placed.snack.cheese!;
    const contact = { ...nearEdge, x: cheese.x + CHEESE_WIDTH - 6 };
    const playing = advanceSnack(placed.snack, contact, 24_000, WIDTH, () => roll);
    assert.equal(playing.snack.action?.kind, kind);
    const during = advanceSnack(playing.snack, playing.pet, 24_180, WIDTH, preferToEat);
    assert.equal(during.snack.action?.kind, kind);
    assert.ok(during.pet.x < playing.pet.x);
    if (kind === "pounce") assert.equal(during.snack.cheese!.x, cheese.x);
    const after = advanceSnack(during.snack, during.pet, 25_000, WIDTH, preferToEat);
    assert.equal(after.snack.action, null);
    assert.ok(after.snack.cheese!.x < cheese.x);
    assert.equal(after.snack.cheese!.bites, 0);
    assert.equal(after.bitesTaken, undefined);
  }
});

test("a pounce lands its leading paw on the remaining edge of a nearly eaten slice", () => {
  const placed = fetchCheese();
  for (const edge of [-1, 1] as const) {
    const cheese = { ...placed.snack.cheese!, edge, bites: 7, tryAfter: 0, noticeAfter: 0 };
    const landing = cheeseLanding(cheese);
    const paw = landing.x + (edge === -1 ? 13 : 35);
    assert.ok(edge === -1 ? paw < cheese.x + 7 : paw > cheese.x + CHEESE_WIDTH - 7);
    assert.ok(landing.lift < cheeseLanding({ ...cheese, bites: 0 }).lift);
    const seeking = { ...placed.snack, cheese, action: { kind: "seek" as const, updatedAt: 24_000 } };
    const x = cheese.x + (edge === -1 ? 6 : CHEESE_WIDTH - 6) - (edge === -1 ? 3 : 45);
    const pounce = advanceSnack(seeking, { ...nearEdge, x, direction: edge }, 24_000, WIDTH, () => .9);
    assert.equal(pounce.snack.action?.kind, "pounce");
    const onCheese = advanceSnack(pounce.snack, pounce.pet, 24_480, WIDTH, preferToEat);
    assert.equal(onCheese.pet.x, cheeseLanding(onCheese.snack.cheese!).x);
  }
});

test("a pounce only starts if the leading paw can reach the cheese", () => {
  const placed = fetchCheese();
  for (const edge of [-1, 1] as const) {
    const cheese = { ...placed.snack.cheese!, edge, bites: 7, x: edge === -1 ? 0 : WIDTH - CHEESE_WIDTH };
    const seeking = { ...placed.snack, cheese, action: { kind: "seek" as const, updatedAt: 24_000 } };
    const x = edge === -1 ? 3 : WIDTH - 48 - 3;
    const next = advanceSnack(seeking, { ...nearEdge, x, direction: edge }, 24_000, WIDTH, () => .9);
    assert.equal(next.snack.action?.kind, "eat");
  }
});
