import { maxX, PET_WIDTH, SPEED_PX_PER_S, type Direction, type Pet, type Random } from "./pet.ts";

export const nextHopAt = (time: number, random: Random) => time + 8_000 + random() * 14_000;
export const nextBurrowAt = (time: number, random: Random) => time + 55_000 + random() * 45_000;

export const recordClick = (recent: number[], time: number) =>
  [...recent.filter((click) => time - click <= 3_000), time];
export const shouldHideFromClicks = (recent: number[]) => recent.length >= 3;

export interface Burrow {
  edge: Direction;
  phase: "run" | "enter" | "hide" | "exit";
  elapsed: number;
  hidingMs: number;
}

export function findBurrow(pet: Pet, width: number, random: Random): Burrow {
  return {
    edge: pet.x < maxX(width) / 2 ? -1 : 1,
    phase: "run",
    elapsed: 0,
    hidingMs: 4_000 + random() * 4_000,
  };
}

const DURATION = 520;
const TRAVEL = PET_WIDTH * .85;

export function burrowVisibility(burrow: Burrow): number {
  if (burrow.phase === "hide") return 0;
  if (burrow.phase === "run") return 1;
  const progress = Math.min(1, burrow.elapsed / DURATION);
  return burrow.phase === "enter" ? 1 - progress : progress;
}

export function advanceBurrow(
  burrow: Burrow, pet: Pet, dt: number, width: number, pace: number,
): { burrow: Burrow | null; pet: Pet } {
  const { edge, phase } = burrow;
  const entrance = edge === -1 ? 0 : maxX(width);
  const elapsed = burrow.elapsed + dt;
  if (phase === "run") {
    const speed = SPEED_PX_PER_S.run * pace;
    const distance = Math.abs(entrance - pet.x);
    const step = Math.min(distance, speed * dt / 1_000);
    return {
      burrow: step === distance ? { ...burrow, phase: "enter", elapsed: 0 } : burrow,
      pet: { ...pet, x: pet.x + edge * step, velocity: edge * speed, direction: edge, mode: "run", idleView: "profile" },
    };
  }
  const direction = phase === "enter" ? edge : edge === 1 ? -1 : 1;
  if (phase === "hide") {
    return {
      burrow: elapsed >= burrow.hidingMs ? { ...burrow, phase: "exit", elapsed: 0 } : { ...burrow, elapsed },
      pet: { ...pet, x: entrance + edge * TRAVEL, velocity: 0, direction },
    };
  }
  const progress = Math.min(1, elapsed / DURATION);
  const x = entrance + edge * TRAVEL * (phase === "enter" ? progress : 1 - progress);
  const pose: Pet = { ...pet, x, direction, velocity: direction * TRAVEL * 1_000 / DURATION, mode: "walk", remainingMs: 2_000 };
  const next = progress < 1
    ? { ...burrow, elapsed }
    : phase === "enter" ? { ...burrow, phase: "hide" as const, elapsed: 0 } : null;
  return { burrow: next, pet: pose };
}
