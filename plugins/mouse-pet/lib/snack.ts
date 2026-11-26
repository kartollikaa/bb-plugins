import { HOP_MS, HOP_TOUCHDOWN } from "./animation.ts";
import { advance, isGrooming, maxX, PET_WIDTH, type Direction, type Pet } from "./pet.ts";

export const CHEESE_WIDTH = 34;
export const CHEESE_VIEWBOX_WIDTH = 48;
export const BITE_MS = 520;
// Each successive cut removes approximately one eighth of the projected cheese silhouette.
const CUTS = [46, 40.3, 35.2, 30.8, 26.4, 21.6, 16.5, 10.5] as const;
const BITES_PER_VISIT = 2;
const BETWEEN_VISITS_MS = 5_500;
const LEAVE_ALONE_MS = 8_000;
const NOTICE_AGAIN_MS = 3_600;

interface Cheese {
  x: number;
  bites: number;
  tryAfter: number;
  noticeAfter: number;
  edge: Direction;
}

type SnackAction =
  | { kind: "fetch"; started: number; fromX: number; direction: Direction; distance: number; duration: number }
  | { kind: "seek"; updatedAt: number }
  | { kind: "push" | "pounce"; started: number; duration: number; fromX: number; cheeseX: number; targetX: number }
  | { kind: "eat"; started: number; initialBites: number; fromX: number };

export interface Snack {
  cheese: Cheese | null;
  action: SnackAction | null;
  availableAt: number;
  touching: boolean;
  visits: number;
  playAfter: number;
}

export function createSnack(time: number): Snack {
  return { cheese: null, action: null, availableAt: time + 12_000, touching: false, visits: 0, playAfter: time };
}

const clamp = (x: number, limit: number) => Math.max(0, Math.min(x, limit));
const ease = (p: number) => p * p * (3 - 2 * p);
const noseOffset = (direction: Direction) => direction === 1 ? PET_WIDTH - 3 : 3;
const cheeseOffset = (cheese: Cheese, artX: number) =>
  (cheese.edge === 1 ? CHEESE_VIEWBOX_WIDTH - artX : artX) * CHEESE_WIDTH / CHEESE_VIEWBOX_WIDTH;
const inwardOffset = (cheese: Cheese) => cheeseOffset(cheese, CUTS[cheese.bites] - 2);

export function cheeseLanding(cheese: Cheese) {
  const artX = (2.5 + CUTS[cheese.bites] - 2) / 2;
  const surfaceY = 14.5 + (2.6 - 14.5) * (artX - 2.5) / (31 - 2.5);
  const paw = cheese.edge === 1 ? 35 : PET_WIDTH - 35;
  return { x: cheese.x + cheeseOffset(cheese, artX) - paw, lift: 27.2 - surfaceY };
}

export function biteMaskPath(bites: number) {
  if (bites === 0) return "";
  const x = CUTS[bites];
  return `M48 0H${x + 1}Q${x - 3} 5 ${x} 8.6Q${x - 4} 11.6 ${x - .5} 15.5Q${x - 4.2} 19.3 ${x} 22.5Q${x - 1.5} 25.2 ${x + 1} 29H48Z`;
}

const mouthTarget = (cheese: Cheese, width: number) =>
  clamp(cheese.x + inwardOffset(cheese) - noseOffset(cheese.edge), maxX(width));

function fitCheese(cheese: Cheese, width: number): Cheese {
  const farthest = Math.max(0, width - CHEESE_WIDTH);
  const reach = noseOffset(cheese.edge) - inwardOffset(cheese);
  const x = cheese.edge === 1
    ? Math.min(farthest, Math.max(cheese.x, reach))
    : clamp(cheese.x, Math.min(farthest, maxX(width) + reach));
  return x === cheese.x ? cheese : { ...cheese, x };
}

const settle = (pet: Pet, x = pet.x): Pet =>
  ({ ...pet, x, velocity: 0, mode: "sit", idleView: "profile", remainingMs: 950 });

const beginEating = (snack: Snack, cheese: Cheese, pet: Pet, time: number): { snack: Snack; pet: Pet } => ({
  snack: { ...snack, touching: true, action: { kind: "eat", started: time, initialBites: cheese.bites, fromX: pet.x } },
  pet: settle({ ...pet, direction: cheese.edge }),
});

function maybePlay(
  snack: Snack, cheese: Cheese, pet: Pet, time: number, width: number, roll: number, pace: number,
): { snack: Snack; pet: Pet } | null {
  if (time < snack.playAfter || roll < .78) return null;
  const kind = roll < .89 ? "push" : "pounce";
  let targetX = fitCheese({ ...cheese, x: cheese.x + cheese.edge * (kind === "push" ? 22 : 9) }, width).x;
  if (kind === "push" && targetX === cheese.x) return null;
  if (kind === "pounce") {
    const limit = maxX(width);
    const landing = cheeseLanding(cheese).x;
    if (landing < 0 || landing > limit) return null;
    const targetLanding = landing + targetX - cheese.x;
    targetX += clamp(targetLanding, limit) - targetLanding;
  }
  const atNose = mouthTarget(cheese, width);
  return {
    snack: {
      ...snack,
      playAfter: time + 16_000,
      action: {
        kind, started: time, duration: kind === "push" ? 760 / pace : 700,
        fromX: kind === "push" ? atNose : pet.x, cheeseX: cheese.x, targetX,
      },
      touching: true,
    },
    pet: settle({ ...pet, direction: cheese.edge }, kind === "push" ? atNose : pet.x),
  };
}

export function interruptSnack(snack: Snack, time: number, width: number): Snack {
  if (!snack.action) return snack;
  const cheese = snack.cheese
    ? { ...fitCheese(snack.cheese, width), tryAfter: time + LEAVE_ALONE_MS, noticeAfter: time + LEAVE_ALONE_MS }
    : null;
  return { ...snack, cheese, action: null, availableAt: time + 3_000, touching: false };
}

export function resizeSnack(snack: Snack, time: number, width: number): Snack {
  const idle = interruptSnack(snack, time, width);
  return idle.cheese ? { ...idle, cheese: fitCheese(idle.cheese, width), touching: false } : idle;
}

export function advanceSnack(
  snack: Snack, pet: Pet, time: number, width: number, random: () => number, hunger = .65, pace = 1,
): { snack: Snack; pet: Pet; bitesTaken?: number } {
  const { action, cheese } = snack;
  if (action?.kind === "fetch") {
    const progress = Math.min((time - action.started) / action.duration, 1);
    const limit = maxX(width);
    const edge = action.direction === 1 ? limit : 0;
    const reach = ease(Math.max(0, Math.min(1, progress / .29)));
    const pull = ease(Math.max(0, (progress - .39) / .61));
    const petX = clamp(action.fromX + (edge - action.fromX) * reach - action.direction * (action.distance + 27) * pull, limit);
    const fromEdge = -CHEESE_WIDTH / 2 + (action.distance + CHEESE_WIDTH / 2) * pull;
    const cheeseCenter = action.direction === 1 ? width - fromEdge : fromEdge;
    const piece = progress >= .39
      ? {
        x: cheeseCenter - CHEESE_WIDTH / 2,
        bites: 0,
        tryAfter: time + LEAVE_ALONE_MS,
        noticeAfter: time + LEAVE_ALONE_MS,
        edge: action.direction,
      }
      : null;
    return {
      snack: { ...snack, cheese: piece, action: progress === 1 ? null : action },
      pet: settle(pet, petX),
    };
  }
  if (action?.kind === "seek" && cheese) {
    const target = mouthTarget(cheese, width);
    const distance = target - pet.x;
    if (Math.abs(distance) <= 3) {
      return maybePlay(snack, cheese, pet, time, width, random(), pace) ??
        beginEating(snack, cheese, settle(pet, target), time);
    }
    const direction = distance < 0 ? -1 : 1;
    const seeking: Pet = {
      ...pet, direction, mode: Math.abs(distance) > 42 ? "run" : "walk", idleView: "profile", remainingMs: 1_000,
    };
    return {
      snack: { ...snack, action: { kind: "seek", updatedAt: time } },
      pet: advance(seeking, time - action.updatedAt, width, random, pace),
    };
  }
  if (cheese && (action?.kind === "push" || action?.kind === "pounce")) {
    const elapsed = time - action.started;
    const progress = clamp(elapsed / action.duration, 1);
    const touchdown = HOP_TOUCHDOWN * HOP_MS;
    const slide = action.kind === "push" ? ease(progress) : ease(clamp((elapsed - touchdown) / 135, 1));
    const current = { ...cheese, x: action.cheeseX + (action.targetX - action.cheeseX) * slide };
    const x = action.kind === "push"
      ? mouthTarget(current, width)
      : action.fromX + (clamp(cheeseLanding(current).x, maxX(width)) - action.fromX) * ease(clamp(elapsed / touchdown, 1));
    return {
      snack: progress === 1
        ? { ...snack, cheese: { ...current, tryAfter: time + 3_000, noticeAfter: time + 3_000 }, action: null, touching: false }
        : { ...snack, cheese: current },
      pet: settle(pet, x),
    };
  }
  if (action?.kind === "eat" && cheese) {
    const progress = Math.max(0, (time - action.started) / BITE_MS);
    const taken = Math.min(BITES_PER_VISIT, Math.floor(progress));
    const bites = action.initialBites + taken;
    const bitesTaken = Math.min(bites, CUTS.length) - cheese.bites;
    if (bites >= CUTS.length) return { snack: createSnack(time), pet: settle(pet), bitesTaken };
    const current = { ...cheese, bites };
    if (taken === BITES_PER_VISIT) {
      const resume = time + BETWEEN_VISITS_MS;
      return {
        snack: { ...snack, cheese: { ...current, tryAfter: resume, noticeAfter: resume }, action: null, visits: 0 },
        pet: settle(pet),
        bitesTaken,
      };
    }
    const from = taken === 0 ? action.fromX : mouthTarget({ ...cheese, bites: bites - 1 }, width);
    const toward = mouthTarget(current, width);
    const blend = ease(Math.min((progress - taken) * 1.9, 1));
    return {
      snack: { ...snack, cheese: current },
      pet: settle(pet, from + (toward - from) * blend),
      bitesTaken,
    };
  }

  if (pet.mode === "sleep" || pet.mode === "stretch" || isGrooming(pet.mode) || pet.mode === "perch") {
    return { snack, pet };
  }

  if (cheese) {
    const nose = pet.x + noseOffset(pet.direction);
    const inwardEdge = cheese.x + inwardOffset(cheese);
    const touching = pet.direction === cheese.edge && Math.abs(nose - inwardEdge) <= 11;
    if (!touching && time >= cheese.tryAfter && time >= cheese.noticeAfter) {
      const nextCheese = { ...cheese, noticeAfter: time + NOTICE_AGAIN_MS };
      const nextSnack = { ...snack, cheese: nextCheese, touching: false };
      if (random() < .35 + .6 * hunger) return { snack: { ...nextSnack, action: { kind: "seek", updatedAt: time } }, pet };
      return { snack: nextSnack, pet };
    }
    if (!touching || snack.touching || time < cheese.tryAfter) {
      return { snack: touching === snack.touching ? snack : { ...snack, touching }, pet };
    }
    const visits = snack.visits + 1;
    const playing = maybePlay(snack, cheese, pet, time, width, random(), pace);
    if (playing) return playing;
    const choosing = visits > 1 && (visits >= 4 || random() < .72);
    if (!choosing) return { snack: { ...snack, touching, visits }, pet };
    return beginEating({ ...snack, visits }, cheese, pet, time);
  }

  const limit = maxX(width);
  const nearEdge = Math.min(pet.x, limit - pet.x) <= 14;
  if (time < snack.availableAt || limit < 70 || !nearEdge) return { snack, pet };
  const direction = pet.x < limit / 2 ? -1 : 1;
  const farthest = Math.min(146, limit - CHEESE_WIDTH / 2 - 6);
  const nearest = Math.min(60, farthest - 8);
  const distance = nearest + (farthest - nearest) * random();
  const duration = (640 + distance * 13) / pace;
  return {
    snack: { ...snack, action: { kind: "fetch", started: time, fromX: pet.x, direction, distance, duration } },
    pet: settle({ ...pet, direction }),
  };
}
