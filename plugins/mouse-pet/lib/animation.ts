const FULL_CYCLE = Math.PI * 2;

const LEG_PHASES = [0, .58, .48, .06] as const;
export const strideLength = (speed: number) => 14 + Math.min(speed / 150, 1) * 9;

export function gaitFrame(phase: number, speed: number) {
  const effort = Math.min(speed / 38, 1);
  const run = Math.min(Math.max((speed - 38) / 112, 0), 1);
  const stance = .62 - run * .18;
  const stride = strideLength(speed) * effort;
  const feet = LEG_PHASES.map((offset) => {
    const step = (phase + offset) % 1;
    const swing = Math.max((step - stance) / (1 - stance), 0);
    const reach = step < stance ? stance / 2 - step : stance * -.5 * Math.cos(Math.PI * swing);
    return {
      reach: reach * stride,
      lift: Math.sin(Math.PI * swing) ** 2 * (2.2 + run) * effort,
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

export function turnFrame(from: number, to: number, progress: number) {
  const eased = progress * progress * (3 - 2 * progress);
  const yaw = from + (to - from) * eased;
  const profile = Math.min(Math.abs(yaw) / .7, 1);
  return { yaw, width: .55 + .45 * Math.abs(yaw), profile: profile * profile };
}

export const FALL_GRAVITY = 5_500;

export function fallFrame(lift: number, x: number, vx: number, vy: number, time: number) {
  const landingTime = (vy + Math.sqrt(vy ** 2 + 2 * FALL_GRAVITY * lift)) / FALL_GRAVITY;
  const t = Math.min(time, landingTime);
  return {
    lift: time >= landingTime ? 0 : lift + vy * t - FALL_GRAVITY * t ** 2 / 2,
    x: x + vx * t,
  };
}
