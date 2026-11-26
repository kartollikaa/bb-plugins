import assert from "node:assert/strict";
import { test } from "node:test";
import { advancePerspective, createPerspective, perspectiveFrame } from "../lib/perspective.ts";

test("a front-facing visit rolls only once, after the initial cooldown", () => {
  let plane = advancePerspective(createPerspective(0), "front", 10_000, 60, () => 0);
  assert.equal(plane.near, false);
  plane = advancePerspective(plane, "front", 50_000, 60, () => 0);
  assert.equal(plane.near, false);
  plane = advancePerspective(plane, "profile", 51_000, 60, () => 0);
  plane = advancePerspective(plane, "front", 52_000, 60, () => .9);
  assert.equal(plane.near, false);
  assert.equal(advancePerspective(plane, "front", 52_060, 60, () => 0).near, false);
});

test("the closer plane persists while moving and a back turn walks away", () => {
  let plane = advancePerspective(createPerspective(0), "front", 40_000, 60, () => 0);
  assert.equal(plane.near, true);
  assert.ok(Math.abs(perspectiveFrame(plane).step) > 0);
  plane = advancePerspective(plane, "profile", 41_000, 720, () => 0);
  assert.equal(perspectiveFrame(plane).scale, 1.23);
  plane = advancePerspective(plane, "back", 43_000, 720, () => 0);
  assert.equal(perspectiveFrame(plane).scale, 1);
  assert.equal(advancePerspective(plane, "front", 44_000, 720, () => 0).near, false);
});
