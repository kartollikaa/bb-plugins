const FULL_CYCLE = Math.PI * 2;

const LEG_PHASES = [0, .58, .48, .06] as const;

export function gaitFrame(phase: number, speed: number) {
  const effort = Math.min(speed / 38, 1);
  const run = Math.min(Math.max((speed - 38) / 112, 0), 1);
  const feet = LEG_PHASES.map((offset) => {
    const step = (phase + offset) * FULL_CYCLE;
    return {
      angle: Math.cos(step) * (18 + run * 9) * effort,
      lift: Math.max(0, Math.sin(step)) * (1.1 + run * 1.1) * effort,
    };
  });
  return {
    feet,
    tail: Math.sin((phase - .18) * FULL_CYCLE) * (1.7 + run * 2.4) * effort,
  };
}

export function hopHeight(progress: number, startingHeight = 0) {
  const launch = startingHeight > 0 ? 0 : .12;
  const flight = Math.max(0, Math.min((progress - launch) / (.87 - launch), 1));
  return (startingHeight + 58 * flight) * (1 - flight);
}
