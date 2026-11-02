export type PetMode = "walk" | "run" | "sit" | "groom" | "sleep";
export type Direction = 1 | -1;

export interface Pet {
  x: number;
  direction: Direction;
  mode: PetMode;
  remainingMs: number;
}

export const PET_WIDTH = 48;
export const MAX_FRAME_MS = 100;

const SPEED_PX_PER_S: Record<PetMode, number> = { walk: 38, run: 150, sit: 0, groom: 0, sleep: 0 };
const DURATION_MS: Record<PetMode, readonly [number, number]> = {
  walk: [2_000, 5_000],
  run: [1_500, 3_500],
  sit: [1_500, 4_000],
  groom: [2_000, 3_500],
  sleep: [6_000, 14_000],
};
const AFTER_MOVING: ReadonlyArray<readonly [PetMode, number]> = [
  ["walk", 25],
  ["run", 25],
  ["sit", 25],
  ["groom", 15],
  ["sleep", 10],
];
const AFTER_RESTING: ReadonlyArray<readonly [PetMode, number]> = [
  ["walk", 55],
  ["run", 45],
];
const TURN_AROUND_CHANCE = 0.3;
const STARTLE_MS = 2_500;

export type Random = () => number;

export const isMoving = (mode: PetMode) => SPEED_PX_PER_S[mode] > 0;

export const maxX = (viewportWidth: number) => Math.max(0, viewportWidth - PET_WIDTH);

function pickWeighted(options: ReadonlyArray<readonly [PetMode, number]>, random: Random): PetMode {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [mode, weight] of options) {
    roll -= weight;
    if (roll < 0) return mode;
  }
  return options[options.length - 1][0];
}

function durationFor(mode: PetMode, random: Random): number {
  const [min, max] = DURATION_MS[mode];
  return min + random() * (max - min);
}

export function createPet(viewportWidth: number, random: Random): Pet {
  return {
    x: random() * maxX(viewportWidth),
    direction: random() < 0.5 ? 1 : -1,
    mode: "walk",
    remainingMs: durationFor("walk", random),
  };
}

function chooseNext(pet: Pet, random: Random): Pet {
  const mode = pickWeighted(isMoving(pet.mode) ? AFTER_MOVING : AFTER_RESTING, random);
  const turns = isMoving(mode) && random() < TURN_AROUND_CHANCE;
  return {
    ...pet,
    mode,
    direction: turns ? (pet.direction === 1 ? -1 : 1) : pet.direction,
    remainingMs: durationFor(mode, random),
  };
}

/** Moves the pet by `dtMs`, bounces it off both window edges and switches mode when the current one runs out. */
export function advance(pet: Pet, dtMs: number, viewportWidth: number, random: Random): Pet {
  const dt = Math.min(Math.max(dtMs, 0), MAX_FRAME_MS);
  const limit = maxX(viewportWidth);
  let { x, direction } = pet;
  x += direction * SPEED_PX_PER_S[pet.mode] * (dt / 1000);
  if (x <= 0) {
    x = 0;
    direction = 1;
  } else if (x >= limit) {
    x = limit;
    direction = -1;
  }
  const moved: Pet = { ...pet, x, direction, remainingMs: pet.remainingMs - dt };
  return moved.remainingMs > 0 ? moved : chooseNext(moved, random);
}

/** A click: the pet bolts the other way. */
export function startle(pet: Pet): Pet {
  return { ...pet, mode: "run", direction: pet.direction === 1 ? -1 : 1, remainingMs: STARTLE_MS };
}

/** Keeps the pet inside the window after a resize. */
export function fit(pet: Pet, viewportWidth: number): Pet {
  return { ...pet, x: Math.min(pet.x, maxX(viewportWidth)) };
}
