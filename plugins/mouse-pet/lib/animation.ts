const FULL_CYCLE = Math.PI * 2;

const MOVES = [
  { walk: [0, .25, .5, .75], run: [0, .47, .055, .53], stride: 1, lift: 1, bound: 1, rock: .35, breath: [.038, 440] },
  { walk: [0, .38, .48, .88], run: [0, .56, .08, .62], stride: .8, lift: 1.45, bound: .8, rock: 2.1, breath: [.054, 370] },
  { walk: [0, .53, .44, .04], run: [0, .43, .24, .68], stride: 1.12, lift: .74, bound: .58, rock: -2.6, breath: [.026, 560] },
  { walk: [0, .58, .29, .82], run: [0, .52, .13, .64], stride: .94, lift: 1.17, bound: 1.25, rock: 3.2, breath: [.045, 510] },
] as const;
export type MoveVariant = 0 | 1 | 2 | 3;
export const nextMoveVariant = (previous: MoveVariant, roll: number) =>
  ((previous + 1 + Math.floor(roll * (MOVES.length - 1))) % MOVES.length) as MoveVariant;

const running = (speed: number) => Math.min(Math.max((speed - 55) / 95, 0), 1);
export const strideLength = (speed: number, variant: MoveVariant = 0, pace = 1) =>
  (14 + Math.min(speed / 38, 1) * 3 + running(speed) * 29) * MOVES[variant].stride * (.7 + .3 * pace);
export const HOP_TOUCHDOWN = .87;
export const HOP_MS = 420;

function pulse(phase: number, start: number, duration: number) {
  const progress = Math.max(0, Math.min((phase - start) / duration, 1));
  return Math.sin(Math.PI * progress) ** 2;
}

export function gaitFrame(phase: number, speed: number, variant: MoveVariant = 0, pace = 1) {
  const move = MOVES[variant];
  const effort = Math.min(speed / 38, 1);
  const run = running(speed);
  const stance = .62 - run * .34;
  const stride = strideLength(speed, variant, pace) * effort;
  const feet = move.walk.map((offset, index) => {
    const shift = (move.run[index] - offset + 1.5) % 1 - .5;
    const step = (phase + offset + shift * run + 1) % 1;
    const swing = Math.max((step - stance) / (1 - stance), 0);
    const reach = step < stance ? stance / 2 - step : stance * -.5 * Math.cos(Math.PI * swing);
    const raised = Math.sin(Math.PI * swing) ** 2;
    return {
      reach: reach * stride,
      lift: raised * (2.2 + run) * effort * move.lift,
      contact: 1 - raised,
    };
  });
  return {
    feet,
    tail: Math.sin((phase - .18) * FULL_CYCLE) * (1.7 + run * 2.4) * effort,
    bound: pulse(phase, .12, .65) * run ** 2 * 3.3 * move.bound,
    rock: Math.sin(phase * FULL_CYCLE) * effort * move.rock * (1 + run * .45),
  };
}

export function sleepBreath(time: number, rest: number, variant: MoveVariant) {
  const [depth, period] = MOVES[variant].breath;
  return 1 + rest * depth * (1 - Math.cos(time / period)) / 2;
}

export function hopHeight(progress: number, startingHeight = 0) {
  const flight = Math.max(0, Math.min(progress / HOP_TOUCHDOWN, 1));
  return (startingHeight + 88 * flight) * (1 - flight);
}

export function pounceHeight(age: number, duration: number, surfaceHeight: number) {
  const rise = age / (HOP_MS * HOP_TOUCHDOWN);
  const stepDown = (duration - age) / 150;
  return Math.max(0, Math.min(rise, stepDown, 1)) * surfaceHeight;
}

export function turnFrame(from: number, to: number, progress: number) {
  const eased = progress * progress * (3 - 2 * progress);
  const yaw = from + (to - from) * eased;
  const profile = Math.min(Math.abs(yaw) / .7, 1);
  return { yaw, width: .55 + .45 * Math.abs(yaw), profile: profile * profile };
}

export interface Spring {
  value: number;
  velocity: number;
}

export function followSpring(spring: Spring, target: number, dtMs: number): Spring {
  const step = Math.min(dtMs, 32) / 1_000;
  const velocity = spring.velocity + ((target - spring.value) * 210 - spring.velocity * 18) * step;
  return { value: spring.value + velocity * step, velocity };
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
