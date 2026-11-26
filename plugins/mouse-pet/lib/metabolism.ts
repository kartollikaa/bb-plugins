export const BURST_FULLNESS = 1;

export interface Metabolism {
  fullness: number;
  satiety: number;
  belly: number;
}

export const createMetabolism = (): Metabolism => ({ fullness: 0, satiety: .35, belly: 0 });
export const hunger = (metabolism: Metabolism) => 1 - metabolism.satiety;

export function advanceMetabolism(
  metabolism: Metabolism, elapsedMs: number, distance: number, activeMs: number, bites: number,
): Metabolism {
  const seconds = elapsedMs / 1_000;
  const activity = distance * .000018 + activeMs / 1_000 * .0006;
  const fullness = Math.max(0, metabolism.fullness - seconds * .001 - activity) + bites * .087;
  const satiety = Math.min(1, Math.max(0, metabolism.satiety - seconds * .007 - activity * 2) + bites * .22);
  const belly = fullness + (metabolism.belly - fullness) * Math.exp(-seconds / .85);
  return { fullness, satiety, belly };
}
