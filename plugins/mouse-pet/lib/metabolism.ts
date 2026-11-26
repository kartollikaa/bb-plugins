export const MAX_FULLNESS = 1.35;

export interface Metabolism {
  fullness: number;
  satiety: number;
  belly: number;
}

export const createMetabolism = (): Metabolism => ({ fullness: 0, satiety: .35, belly: 0 });
export const hunger = (metabolism: Metabolism) => 1 - metabolism.satiety;

export function bellyScale(belly: number) {
  const shape = bellyFraction(belly) ** 2;
  return { width: 1 + .14 * shape, height: 1 + 1.15 * shape };
}

const bellyFraction = (belly: number) => Math.max(0, Math.min(1, belly / MAX_FULLNESS));
export const movementPace = (belly: number) => 1 - .52 * bellyFraction(belly) ** 1.5;

export function advanceMetabolism(
  metabolism: Metabolism, elapsedMs: number, distance: number, activeMs: number, bites: number,
): Metabolism {
  const seconds = elapsedMs / 1_000;
  const activity = distance * .000018 + activeMs / 1_000 * .0006;
  let fullness = Math.max(0, metabolism.fullness - seconds * .00045 - activity);
  let satiety = Math.max(0, metabolism.satiety - seconds * .007 - activity * 2);
  for (let bite = 0; bite < bites; bite++) {
    fullness = Math.min(MAX_FULLNESS, fullness + .031 + .04 * satiety ** 2);
    satiety += (1 - satiety) * .18;
  }
  const belly = fullness + (metabolism.belly - fullness) * Math.exp(-seconds / 2.4);
  return { fullness, satiety, belly };
}
