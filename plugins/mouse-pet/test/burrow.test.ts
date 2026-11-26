import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceBurrow, burrowPortal, findBurrow, nextBurrowAt, nextHopAt, recordClick, shouldHideFromClicks, type Burrow } from "../lib/burrow.ts";
import { createPet, PET_WIDTH } from "../lib/pet.ts";

test("only clustered clicks trigger a retreat and solo activities have randomized deadlines", () => {
  const pair = recordClick(recordClick([], 0), 200);
  assert.equal(shouldHideFromClicks(pair), false);
  assert.equal(shouldHideFromClicks(recordClick(pair, 400)), true);
  assert.equal(shouldHideFromClicks(recordClick(pair, 3_201)), false);
  for (const deadline of [nextBurrowAt, nextHopAt]) {
    assert.ok(deadline(100, () => .9) > deadline(100, () => .1));
  }
});

test("the mouse crosses the inset doorway, peeks and runs out facing away from the opening", () => {
  for (const width of [280, 800]) {
    for (const position of [.05, .35, .65, .95]) {
      let pet = createPet(width, () => position);
      let burrow: Burrow | null = findBurrow(pet, width, () => 0);
      const { edge, direction } = burrow;
      const door = burrowPortal(width, edge);
      const phases = new Set<string>();
      const crossings: Partial<Record<Burrow["phase"], number[]>> = {};
      assert.equal(edge, position < .5 ? -1 : 1);
      assert.ok(door >= 70 && door <= width - 70);
      for (let cycle = 0; burrow && cycle < 600; cycle++) {
        phases.add(burrow.phase);
        (crossings[burrow.phase] ??= []).push(direction * (pet.x + PET_WIDTH / 2 - door));
        const previousX = pet.x;
        ({ burrow, pet } = advanceBurrow(burrow, pet, 16, width, .48, 1.23));
        assert.ok(Math.abs(pet.x - previousX) < 2);
      }
      assert.deepEqual([...phases], ["run", "enter", "hide", "peek", "exit"]);
      assert.ok(crossings.enter!.at(0)! < -30 && crossings.enter!.at(-1)! > 30);
      assert.ok(crossings.exit!.at(0)! > 30 && crossings.exit!.at(-1)! < -30);
      assert.ok(crossings.hide!.every((x) => x > 30));
      const furthestPeek = Math.min(...crossings.peek!);
      assert.ok(furthestPeek > 15 && furthestPeek < 18);
      assert.equal(burrow, null);
      assert.equal(pet.mode, "run");
      assert.equal(pet.direction, -direction);
    }
  }
});
