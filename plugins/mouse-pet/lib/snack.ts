import { maxX, PET_WIDTH, type Direction, type Pet } from "./pet.ts";

export const CHEESE_WIDTH = PET_WIDTH;
const BITE_MS = 310;
const BITES = 4;
const LEAVE_ALONE_MS = 8_000;

interface Cheese {
  x: number;
  bites: number;
  tryAfter: number;
  edge: Direction;
}

type SnackAction =
  | { kind: "fetch"; started: number; fromX: number; direction: Direction; distance: number }
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
const noseOffset = (direction: Direction) => direction === 1 ? PET_WIDTH - 3 : 3;
const inwardOffset = (direction: Direction) => direction === 1 ? 4 : CHEESE_WIDTH - 4;

function fitCheese(cheese: Cheese, width: number): Cheese {
  const farthest = Math.max(0, width - CHEESE_WIDTH);
  const reach = noseOffset(cheese.edge) - inwardOffset(cheese.edge);
  const x = cheese.edge === 1
    ? Math.min(farthest, Math.max(cheese.x, reach))
    : clamp(cheese.x, Math.min(farthest, maxX(width) + reach));
  return x === cheese.x ? cheese : { ...cheese, x };
}

const settle = (pet: Pet, x = pet.x): Pet =>
  ({ ...pet, x, velocity: 0, mode: "sit", idleView: "profile", remainingMs: 950 });

export function interruptSnack(snack: Snack, time: number, width: number): Snack {
  if (!snack.action) return snack;
  const cheese = snack.cheese
    ? { ...fitCheese(snack.cheese, width), tryAfter: time + LEAVE_ALONE_MS }
    : null;
  return { ...snack, cheese, action: null, availableAt: time + 3_000, touching: false };
}

export function resizeSnack(snack: Snack, time: number, width: number): Snack {
  const idle = interruptSnack(snack, time, width);
  return idle.cheese ? { ...idle, cheese: fitCheese(idle.cheese, width), touching: false } : idle;
}

export function advanceSnack(
  snack: Snack, pet: Pet, time: number, width: number, random: () => number,
): { snack: Snack; pet: Pet } {
  const { action, cheese } = snack;
  if (action?.kind === "fetch") {
    const duration = 640 + action.distance * 13;
    const progress = Math.min((time - action.started) / duration, 1);
    const limit = maxX(width);
    const edge = action.direction === 1 ? limit : 0;
    const reach = ease(Math.max(0, Math.min(1, progress / .29)));
    const pull = ease(Math.max(0, (progress - .39) / .61));
    const petX = clamp(action.fromX + (edge - action.fromX) * reach - action.direction * (action.distance + 27) * pull, limit);
    const fromEdge = -CHEESE_WIDTH / 2 + (action.distance + CHEESE_WIDTH / 2) * pull;
    const cheeseCenter = action.direction === 1 ? width - fromEdge : fromEdge;
    const piece = progress >= .39
      ? { x: cheeseCenter - CHEESE_WIDTH / 2, bites: 0, tryAfter: time + LEAVE_ALONE_MS, edge: action.direction }
      : null;
    return {
      snack: { ...snack, cheese: piece, action: progress === 1 ? null : action },
      pet: settle(pet, petX),
    };
  }
  if (action?.kind === "eat" && cheese) {
    const bites = action.initialBites + Math.floor((time - action.started) / BITE_MS);
    return {
      snack: bites >= BITES
        ? createSnack(time)
        : { ...snack, cheese: { ...cheese, bites } },
      pet: settle(pet),
    };
  }

  if (pet.mode === "sleep" || pet.mode === "stretch" || pet.mode === "groom" || pet.mode === "perch") {
    return { snack, pet };
  }

  if (cheese) {
    const nose = pet.x + noseOffset(pet.direction);
    const inwardEdge = cheese.x + inwardOffset(cheese.edge);
    const touching = pet.direction === cheese.edge && Math.abs(nose - inwardEdge) <= 11;
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
  const farthest = Math.min(146, limit - CHEESE_WIDTH / 2 - 6);
  const nearest = Math.min(60, farthest - 8);
  const distance = nearest + (farthest - nearest) * random();
  return {
    snack: { ...snack, action: { kind: "fetch", started: time, fromX: pet.x, direction, distance } },
    pet: settle({ ...pet, direction }),
  };
}
