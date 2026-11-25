import { maxX, PET_WIDTH, type Direction, type Pet } from "./pet.ts";

export const CHEESE_WIDTH = 13;
const FETCH_MS = 960;
const BITE_MS = 310;
const LEAVE_ALONE_MS = 8_000;

interface Cheese {
  x: number;
  bites: number;
  tryAfter: number;
}

type SnackAction =
  | { kind: "fetch"; started: number; fromX: number; direction: Direction }
  | { kind: "eat"; started: number; initialBites: number };

export interface Snack {
  cheese: Cheese | null;
  action: SnackAction | null;
  availableAt: number;
  touching: boolean;
  visits: number;
}

export function createSnack(time: number): Snack {
  return { cheese: null, action: null, availableAt: time + 12_000, touching: false, visits: 0 };
}

const clamp = (x: number, limit: number) => Math.max(0, Math.min(x, limit));
const ease = (p: number) => p * p * (3 - 2 * p);

const settle = (pet: Pet, x = pet.x): Pet =>
  ({ ...pet, x, velocity: 0, mode: "sit", idleView: "profile", remainingMs: 950 });

export function interruptSnack(snack: Snack, time: number, width: number): Snack {
  if (!snack.action) return snack;
  const cheese = snack.cheese
    ? { ...snack.cheese, x: clamp(snack.cheese.x, width - CHEESE_WIDTH), tryAfter: time + LEAVE_ALONE_MS }
    : null;
  return { ...snack, cheese, action: null, availableAt: time + 3_000, touching: false };
}

export function advanceSnack(snack: Snack, pet: Pet, time: number, width: number, random: () => number) {
  const { action, cheese } = snack;
  if (action?.kind === "fetch") {
    const progress = Math.min((time - action.started) / FETCH_MS, 1);
    const limit = maxX(width);
    const edge = action.direction === 1 ? limit : 0;
    const reach = ease(Math.max(0, Math.min(1, progress / .29)));
    const pull = ease(Math.max(0, (progress - .39) / .61));
    const petX = clamp(action.fromX + (edge - action.fromX) * reach - action.direction * 27 * pull, limit);
    const cheeseCenter = action.direction === 1 ? width - 21 * pull : 21 * pull;
    const piece = progress >= .39 ? { x: cheeseCenter - CHEESE_WIDTH / 2, bites: 0, tryAfter: time + LEAVE_ALONE_MS } : null;
    return {
      snack: { ...snack, cheese: piece, action: progress === 1 ? null : action },
      pet: settle(pet, petX),
    };
  }
  if (action?.kind === "eat" && cheese) {
    const bites = action.initialBites + Math.floor((time - action.started) / BITE_MS);
    return {
      snack: bites >= 3
        ? createSnack(time)
        : { ...snack, cheese: { ...cheese, bites } },
      pet: settle(pet),
    };
  }

  if (cheese) {
    const nose = pet.x + (pet.direction === 1 ? 45 : 3);
    const touching = Math.abs(nose - cheese.x - CHEESE_WIDTH / 2) <= 10;
    if (!touching || snack.touching || time < cheese.tryAfter) {
      return { snack: touching === snack.touching ? snack : { ...snack, touching }, pet };
    }
    const visits = snack.visits + 1;
    const choosing = visits > 1 && (visits >= 4 || random() < .55);
    if (!choosing) return { snack: { ...snack, touching, visits }, pet };
    return {
      snack: { ...snack, touching, visits, action: { kind: "eat", started: time, initialBites: cheese.bites } },
      pet: settle(pet),
    };
  }

  const limit = maxX(width);
  const nearEdge = Math.min(pet.x, limit - pet.x) <= 14;
  if (time < snack.availableAt || limit < 70 || !nearEdge) return { snack, pet };
  const direction = pet.x < limit / 2 ? -1 : 1;
  return {
    snack: { ...snack, action: { kind: "fetch", started: time, fromX: pet.x, direction } },
    pet: settle({ ...pet, direction }),
  };
}
