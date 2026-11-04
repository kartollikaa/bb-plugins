import assert from "node:assert/strict";
import { test } from "node:test";
import { PinchTracker, pinchDirection, spread, type Point } from "../lib/pinch.ts";

const pair = (gap: number): Point[] => [
  { x: 200 - gap / 2, y: 400 },
  { x: 200 + gap / 2, y: 400 },
];

test("spread needs exactly two fingers", () => {
  assert.equal(spread([{ x: 0, y: 0 }]), null);
  assert.equal(spread([...pair(10), { x: 0, y: 0 }]), null);
  assert.equal(spread([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5);
});

test("a pinch counts once the fingers move far enough", () => {
  assert.equal(pinchDirection(300, 190), "in");
  assert.equal(pinchDirection(160, 115), "in", "a short pinch on a phone");
  assert.equal(pinchDirection(300, 240), null, "not past the ratio");
  assert.equal(pinchDirection(80, 45), null, "past the ratio but under the minimum travel");
  assert.equal(pinchDirection(200, 310), "out");
  assert.equal(pinchDirection(200, 260), null, "not spread far enough");
  assert.equal(pinchDirection(60, 95), null, "spread past the ratio but under the minimum travel");
});

test("tracker fires once per gesture when fingers come together", () => {
  const tracker = new PinchTracker();
  tracker.touch(pair(300));
  assert.equal(tracker.move(pair(250)), null);
  assert.equal(tracker.move(pair(150)), "in");
  assert.equal(tracker.move(pair(80)), null, "already fired");
  tracker.touch(pair(80).slice(0, 1));
  tracker.touch(pair(300));
  assert.equal(tracker.move(pair(100)), null, "a finger stayed down, still the same gesture");
  tracker.touch([]);
  tracker.touch(pair(300));
  assert.equal(tracker.move(pair(100)), "in", "a new gesture after every finger lifted");
});

test("a fresh touchstart unlatches a gesture whose touchend never arrived", () => {
  const tracker = new PinchTracker();
  tracker.touch(pair(100), true);
  assert.equal(tracker.move(pair(300)), "out");
  tracker.touch(pair(300).slice(0, 1), true);
  tracker.touch(pair(300));
  assert.equal(tracker.move(pair(100)), "in");
});

test("tracker reports spreading and ignores one finger and three fingers", () => {
  const tracker = new PinchTracker();
  tracker.touch(pair(100));
  assert.equal(tracker.move(pair(400)), "out");
  tracker.touch([]);
  tracker.touch(pair(100).slice(0, 1));
  assert.equal(tracker.move(pair(10).slice(0, 1)), null);
  tracker.touch([...pair(300), { x: 0, y: 0 }]);
  assert.equal(tracker.move([...pair(50), { x: 0, y: 0 }]), null);
});
