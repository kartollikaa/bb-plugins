import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceBurrow, burrowVisibility, findBurrow, nextBurrowAt, nextHopAt, recordClick, shouldHideFromClicks, type Burrow } from "../lib/burrow.ts";
import { createPet, maxX } from "../lib/pet.ts";

test("only clustered clicks trigger a retreat and solo activities have randomized deadlines", () => {
  const pair = recordClick(recordClick([], 0), 200);
  assert.equal(shouldHideFromClicks(pair), false);
  assert.equal(shouldHideFromClicks(recordClick(pair, 400)), true);
  assert.equal(shouldHideFromClicks(recordClick(pair, 3_201)), false);
  for (const deadline of [nextBurrowAt, nextHopAt]) {
    assert.ok(deadline(100, () => .9) > deadline(100, () => .1));
  }
});

test("the mouse uses the closest entrance and walks back into the window", () => {
  for (const position of [.05, .95]) {
    let pet = createPet(800, () => position);
    let burrow: Burrow | null = findBurrow(pet, 800, () => 0);
    const phases = new Set<string>();
    assert.equal(burrow.edge, position < .5 ? -1 : 1);
    for (let cycle = 0; burrow && cycle < 120; cycle++) {
      phases.add(burrow.phase);
      if (burrow.phase === "hide") assert.equal(burrowVisibility(burrow), 0);
      ({ burrow, pet } = advanceBurrow(burrow, pet, 100, 800, .48));
    }
    assert.deepEqual([...phases], ["run", "enter", "hide", "exit"]);
    assert.equal(burrow, null);
    assert.equal(pet.x, position < .5 ? 0 : maxX(800));
    assert.equal(pet.direction, position < .5 ? 1 : -1);
  }
});
