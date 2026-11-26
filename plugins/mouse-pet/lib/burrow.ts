import { maxX, PET_WIDTH, SPEED_PX_PER_S, type Direction, type Pet, type Random } from "./pet.ts";

export const nextHopAt = (time: number, random: Random) => time + 8_000 + random() * 14_000;
export const nextBurrowAt = (time: number, random: Random) => time + 55_000 + random() * 45_000;

export const recordClick = (recent: number[], time: number) =>
  [...recent.filter((click) => time - click <= 3_000), time];
export const shouldHideFromClicks = (recent: number[]) => recent.length >= 3;

export interface Burrow {
  edge: Direction;
  direction: Direction;
  phase: "run" | "enter" | "hide" | "peek" | "exit";
  elapsed: number;
  hidingMs: number;
}

export function findBurrow(pet: Pet, width: number, random: Random): Burrow {
  const edge = pet.x < maxX(width) / 2 ? -1 : 1;
  const direction = pet.x + PET_WIDTH / 2 > burrowPortal(width, edge) ? -1 : 1;
  return {
    edge,
    direction,
    phase: "run",
    elapsed: 0,
    hidingMs: 4_000 + random() * 4_000,
  };
}

const CLEARANCE = 33;
const PEEK_MS = 1_850;
const ease = (progress: number) => {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
};

export function burrowPortal(width: number, edge: Direction): number {
  const inset = Math.min(88, width / 4);
  return edge === -1 ? inset : width - inset;
}

export function advanceBurrow(
  burrow: Burrow, pet: Pet, dt: number, width: number, pace: number, scale = 1,
): { burrow: Burrow | null; pet: Pet } {
  const { edge, direction, phase } = burrow;
  const center = burrowPortal(width, edge) - PET_WIDTH / 2;
  const approach = Math.min(maxX(width), Math.max(0, center - direction * CLEARANCE));
  const inside = center + direction * CLEARANCE;
  const outward = direction === 1 ? -1 : 1;
  const elapsed = burrow.elapsed + dt;
  if (phase === "hide") {
    return {
      burrow: elapsed >= burrow.hidingMs - PEEK_MS ? { ...burrow, phase: "peek", elapsed: 0 } : { ...burrow, elapsed },
      pet: { ...pet, x: inside, velocity: 0, direction: outward, mode: "sit", idleView: "profile" },
    };
  }
  if (phase === "peek") {
    const reach = ease(elapsed / 480) * ease((PEEK_MS - 360 - elapsed) / 410);
    const x = inside + outward * (CLEARANCE - 13.5 * scale) * reach;
    return {
      burrow: elapsed >= PEEK_MS ? { ...burrow, phase: "exit", elapsed: 0 } : { ...burrow, elapsed },
      pet: { ...pet, x, velocity: 0, direction: outward, mode: "sit", idleView: "profile" },
    };
  }

  const targetX = phase === "enter" ? inside : approach;
  const facing = targetX === pet.x ? (phase === "exit" ? outward : direction) : targetX > pet.x ? 1 : -1;
  const target = SPEED_PX_PER_S.run * pace;
  const previous = Math.max(0, pet.velocity * facing);
  const speed = previous + Math.min(dt * .85, Math.max(-dt * .85, target - previous));
  const distance = Math.abs(targetX - pet.x);
  const step = Math.min(distance, (previous + speed) * dt / 2_000);
  const pose: Pet = { ...pet, x: pet.x + facing * step, velocity: facing * speed, direction: facing, mode: "run", idleView: "profile", remainingMs: 1_100 };
  if (step < distance) return { burrow, pet: pose };
  if (phase === "run") return { burrow: { ...burrow, phase: "enter", elapsed: 0 }, pet: pose };
  if (phase === "enter") return { burrow: { ...burrow, phase: "hide", elapsed: 0 }, pet: pose };
  return { burrow: null, pet: pose };
}
