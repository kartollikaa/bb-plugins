export type PetMode = "walk" | "run" | "sit" | "perch" | "groom" | "sleep" | "skid" | "stretch";
export type Direction = 1 | -1;
export type IdleView = "profile" | "front" | "back";

export interface Pet {
  x: number;
  velocity: number;
  direction: Direction;
  idleView: IdleView;
  mode: PetMode;
  remainingMs: number;
}

export const PET_WIDTH = 48;
export const MAX_FRAME_MS = 100;
export const SKID_MS = 260;

const SPEED_PX_PER_S: Record<PetMode, number> = {
  walk: 38, run: 150, sit: 0, perch: 0, groom: 0, sleep: 0, skid: 0, stretch: 0,
};
const DURATION_MS: Record<PetMode, readonly [number, number]> = {
  walk: [2_000, 5_000],
  run: [1_500, 3_500],
  sit: [1_500, 4_000],
  perch: [1_800, 3_500],
  groom: [2_000, 3_500],
  sleep: [6_000, 14_000],
  skid: [SKID_MS, SKID_MS],
  stretch: [620, 620],
};
const AFTER_MOVING: ReadonlyArray<readonly [PetMode, number]> = [
  ["walk", 25],
  ["run", 25],
  ["sit", 15],
  ["perch", 10],
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
    velocity: 0,
    direction: random() < 0.5 ? 1 : -1,
    idleView: "profile",
    mode: "walk",
    remainingMs: durationFor("walk", random),
  };
}

function chooseNext(pet: Pet, random: Random): Pet {
  if (pet.mode === "skid") {
    return { ...pet, velocity: 0, direction: reverse(pet.direction), mode: "run", remainingMs: durationFor("run", random) };
  }
  if (pet.mode === "sleep") {
    return { ...pet, mode: "stretch", remainingMs: durationFor("stretch", random) };
  }
  const mode = pet.mode === "stretch" ? "walk" : pickWeighted(isMoving(pet.mode) ? AFTER_MOVING : AFTER_RESTING, random);
  const turns = isMoving(mode) && random() < TURN_AROUND_CHANCE;
  const duration = durationFor(mode, random);
  const look = mode === "sit" ? random() : 0;
  return {
    ...pet,
    mode,
    direction: turns ? reverse(pet.direction) : pet.direction,
    idleView: mode === "sit" && look >= .24 ? (look < .62 ? "front" : "back") : "profile",
    remainingMs: duration,
  };
}

const reverse = (direction: Direction): Direction => direction === 1 ? -1 : 1;

export function advance(pet: Pet, dtMs: number, viewportWidth: number, random: Random): Pet {
  const dt = Math.min(Math.max(dtMs, 0), MAX_FRAME_MS);
  const limit = maxX(viewportWidth);
  let { x, velocity, direction } = pet;
  const edge = direction === -1 ? 0 : limit;
  const skidDistance = Math.min(20, limit / 2);
  if (pet.mode === "skid" && pet.remainingMs > 0) {
    const remainingFraction = Math.max(0, 1 - dt / pet.remainingMs);
    const slowed = velocity * remainingFraction;
    const traveled = (velocity + slowed) * Math.min(dt, pet.remainingMs) / 2_000;
    x += traveled;
    velocity = (edge - x) * direction > 0 ? slowed : 0;
  } else {
    const target = direction * SPEED_PX_PER_S[pet.mode];
    const difference = target - velocity;
    const acceleration = Math.min(Math.abs(difference), dt * (target === 0 ? 1.2 : .85));
    const nextVelocity = velocity + Math.sign(difference) * acceleration;
    x += (velocity + nextVelocity) * dt / 2_000;
    velocity = nextVelocity;
  }
  const hitsEdge = direction === -1 ? x <= 0 : x >= limit;
  x = Math.max(0, Math.min(x, limit));
  if (limit > 0 && pet.mode === "run" && velocity * direction >= 75 && Math.abs(x - edge) <= skidDistance) {
    return { ...pet, x, velocity, mode: "skid", remainingMs: SKID_MS };
  }
  if (hitsEdge && isMoving(pet.mode)) {
    direction = reverse(direction);
    velocity = 0;
  }
  const moved: Pet = { ...pet, x, velocity: limit === 0 ? 0 : velocity, direction, remainingMs: pet.remainingMs - dt };
  return moved.remainingMs > 0 ? moved : chooseNext(moved, random);
}

/** A click: the pet bolts the other way. */
export function startle(pet: Pet): Pet {
  return { ...pet, mode: "run", direction: reverse(pet.direction), remainingMs: STARTLE_MS };
}

/** Keeps the pet inside the window after a resize. */
export function fit(pet: Pet, viewportWidth: number): Pet {
  const fitted = { ...pet, x: Math.min(pet.x, maxX(viewportWidth)) };
  return fitted.mode === "skid" ? { ...fitted, velocity: 0, mode: "walk", remainingMs: 2_000 } : fitted;
}
