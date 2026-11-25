const FULL_CYCLE = Math.PI * 2;

const LEG_PHASES = [0, .58, .48, .06] as const;

export function gaitFrame(phase: number, speed: number) {
  const effort = Math.min(speed / 38, 1);
  const run = Math.min(Math.max((speed - 38) / 112, 0), 1);
  const feet = LEG_PHASES.map((offset) => {
    const step = (phase + offset) * FULL_CYCLE;
    return {
      angle: Math.cos(step) * (22 + run * 14) * effort,
      lift: Math.max(0, Math.sin(step)) * (1.6 + run * 1.7) * effort,
    };
  });
  return {
    feet,
    bob: -(.45 + run * 1.15) * effort * Math.sin(phase * FULL_CYCLE * 2) ** 2,
    tail: Math.sin((phase - .18) * FULL_CYCLE) * (3 + run * 7) * effort,
  };
}

export function hopHeight(progress: number) {
  const flight = Math.max(0, Math.min((progress - .12) / .75, 1));
  return 58 * flight * (1 - flight);
}
