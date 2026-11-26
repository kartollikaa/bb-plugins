const FULL_CYCLE = Math.PI * 2;

const MOVES = [
  { lift: 1, bob: 1, tail: 1, breath: [.035, 480] },
  { lift: 1.16, bob: .82, tail: .64, breath: [.043, 430] },
  { lift: .78, bob: .66, tail: 1.12, breath: [.024, 590] },
  { lift: 1.05, bob: 1.2, tail: 1.28, breath: [.039, 530] },
] as const;
const WALK_OFFSETS = [0, .75, .5, .25] as const;

export type MoveVariant = 0 | 1 | 2 | 3;
export const nextMoveVariant = (previous: MoveVariant, roll: number) =>
  ((previous + 1 + Math.floor(roll * (MOVES.length - 1))) % MOVES.length) as MoveVariant;

interface GaitStyle { lift: number; bob: number; tail: number }

export function blendGaitStyle(style: GaitStyle, variant: MoveVariant, dt: number): GaitStyle {
  const target = MOVES[variant];
  const blend = 1 - Math.exp(-dt / 150);
  return {
    lift: style.lift + (target.lift - style.lift) * blend,
    bob: style.bob + (target.bob - style.bob) * blend,
    tail: style.tail + (target.tail - style.tail) * blend,
  };
}

const unit = (value: number) => Math.min(Math.max(value, 0), 1);
const smooth = (value: number) => value * value * (3 - 2 * value);
const running = (speed: number) => smooth(unit((speed - 43) / 90));
export const strideLength = (speed: number, pace = 1, projection = 1) =>
  (15 + running(speed) * 12) * (.8 + .2 * pace) * projection;
export const HOP_TOUCHDOWN = .87;
export const HOP_MS = 420;

export function gaitFrame(phase: number, speed: number, pace = 1, style: GaitStyle = MOVES[0]) {
  const effort = smooth(unit(speed / 18));
  const run = running(speed);
  const stance = .63 - run * .12;
  const stride = strideLength(speed, pace) * effort;
  const feet = WALK_OFFSETS.map((offset, index) => {
    const step = (phase + offset - (index % 2) * .25 * run + 1) % 1;
    const swing = Math.max((step - stance) / (1 - stance), 0);
    return {
      reach: (stance / 2 - step + smooth(swing)) * stride,
      lift: Math.sin(Math.PI * swing) ** 2 * (1.65 + run * 1.15) * effort * style.lift,
    };
  });
  const walkBob = Math.sin(phase * FULL_CYCLE * 2) ** 2;
  const trotBob = Math.sin(phase * FULL_CYCLE) ** 2;
  return {
    feet,
    tail: Math.sin((phase - .18) * FULL_CYCLE) * (1.2 + run * 2) * effort * style.tail,
    bob: (walkBob * .45 * (1 - run) + trotBob * .9 * run) * effort * style.bob,
  };
}

export function sleepBreath(time: number, rest: number, variant: MoveVariant) {
  const [depth, period] = MOVES[variant].breath;
  return 1 + rest * depth * (1 - Math.cos(time / period)) / 2;
}

export function hopHeight(progress: number, startingHeight = 0, strength = 1) {
  const flight = unit(progress / HOP_TOUCHDOWN);
  return (startingHeight + 88 * strength * flight) * (1 - flight);
}

export function hopCompression(progress: number, strength: number) {
  const landing = unit((progress - HOP_TOUCHDOWN) / (1 - HOP_TOUCHDOWN));
  return .065 * strength * 4 * landing * (1 - landing);
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
