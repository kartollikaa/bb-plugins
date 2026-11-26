import type { IdleView, Random } from "./pet.ts";

export interface Perspective {
  near: boolean;
  depth: number;
  view: IdleView;
  availableAt: number;
}

const CROSSING_MS = 720;
const APPROACH_CHANCE = .28;

export const createPerspective = (time: number): Perspective =>
  ({ near: false, depth: 0, view: "profile", availableAt: time + 32_000 });

export function advancePerspective(perspective: Perspective, view: IdleView, time: number, dt: number, random: Random): Perspective {
  let { near, depth, availableAt } = perspective;
  if (view === "back" && near) {
    near = false;
    availableAt = time + 45_000;
  } else if (view === "front" && perspective.view !== "front" && !near &&
      depth === 0 && time >= availableAt && random() < APPROACH_CHANCE) {
    near = true;
  }
  const amount = dt / CROSSING_MS;
  depth = near ? Math.min(1, depth + amount) : Math.max(0, depth - amount);
  return { near, depth, view, availableAt };
}

export function perspectiveFrame({ depth }: Perspective) {
  const blend = depth * depth * (3 - 2 * depth);
  const step = Math.sin(depth * Math.PI * 6) * Math.sin(depth * Math.PI) ** .35;
  return { scale: 1 + .23 * blend, shift: 1.5 * blend, step };
}
