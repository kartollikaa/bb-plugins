import { advance, createPet, fit, maxX, MAX_FRAME_MS, PET_WIDTH, startle, type Pet } from "./pet.ts";
import { carryPosition, FLOOR_GAP, HOLD_MS, maxLift, PET_HEIGHT, sniffDistance, type Point } from "./interaction.ts";
import { FALL_GRAVITY, fallFrame, gaitFrame, hopHeight, turnFrame } from "./animation.ts";

const ROOT_ATTR = "data-mouse-pet";
const SQUEAK_MS = 700;
const HOP_MS = 420;
const SNIFF_DWELL_MS = 650;
const APPROACH_MS = 320;
const SNIFF_MS = 900;
const REAR_MS = 650;
const LAND_MS = 180;

const FUR = "#c9c9d6";
const FUR_FAR = "#a3a3b3";
const PINK = "#f3a2b6";
const INK = "#2b2b36";

const STYLE = `
[${ROOT_ATTR}] {
  position: fixed; left: 0; right: 0; bottom: 0; height: 40px; z-index: 40;
  pointer-events: none; overflow: visible;
}
[${ROOT_ATTR}] .mp-mouse {
  position: absolute; left: 0; bottom: ${FLOOR_GAP}px; width: ${PET_WIDTH}px; height: ${PET_HEIGHT}px;
  pointer-events: auto; cursor: pointer; will-change: transform; user-select: none;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
[${ROOT_ATTR}] .mp-hop, [${ROOT_ATTR}] .mp-flip, [${ROOT_ATTR}] svg { display: block; width: 100%; height: 100%; }
[${ROOT_ATTR}] .mp-flip { position: relative; isolation: isolate; }
[${ROOT_ATTR}] .mp-profile { transform: scaleX(var(--mp-turn, 1)); opacity: var(--mp-profile, 1); }
[${ROOT_ATTR}] .mp-anfas { position: absolute; inset: 0; opacity: calc(1 - var(--mp-profile, 1)); mix-blend-mode: plus-lighter; }
[${ROOT_ATTR}] .mp-hop[data-hop] .mp-impact { animation: mp-hop-impact ${HOP_MS}ms ease-in-out both; }
[${ROOT_ATTR}] svg { overflow: visible; }

[${ROOT_ATTR}] .mp-leg, [${ROOT_ATTR}] .mp-tail, [${ROOT_ATTR}] .mp-eye,
[${ROOT_ATTR}] .mp-impact, [${ROOT_ATTR}] .mp-wash { transform-box: view-box; }
[${ROOT_ATTR}] .mp-tail { transform-origin: 12px 19px; transform: rotate(var(--mp-tail, 0deg)); }
[${ROOT_ATTR}] .mp-eye { transform-origin: 38px 14.5px; }
[${ROOT_ATTR}] [data-mode="sit"]:not([data-moving]) .mp-eye { animation: mp-blink 3.8s .7s infinite; }
[${ROOT_ATTR}] .mp-eye-state, [${ROOT_ATTR}] .mp-eye-closed { transition: opacity .18s ease; }
[${ROOT_ATTR}] .mp-eye-closed { opacity: 0; }
[${ROOT_ATTR}] .mp-impact { transform-origin: 24px 28px; }
[${ROOT_ATTR}] [data-mode="press"] { cursor: grab; }
[${ROOT_ATTR}] [data-mode="carry"] { cursor: default; }
[${ROOT_ATTR}] .mp-pose, [${ROOT_ATTR}] .mp-head, [${ROOT_ATTR}] .mp-front,
[${ROOT_ATTR}] .mp-grip, [${ROOT_ATTR}] .mp-leg-pose, [${ROOT_ATTR}] .mp-tail-pose, [${ROOT_ATTR}] .mp-far-front {
  transform-box: view-box;
  transition: transform .16s ease-out, opacity .16s ease-out;
}
[${ROOT_ATTR}] .mp-pose { transform-origin: 24px 28px; }
[${ROOT_ATTR}] .mp-head { transform-origin: 32px 17px; }
[${ROOT_ATTR}] .mp-front { transform-origin: 35px 21px; }
[${ROOT_ATTR}] .mp-wash { transform-origin: 35px 21px; transform: rotate(var(--mp-wash, 0deg)); }
[${ROOT_ATTR}] .mp-grip { opacity: 0; }
[${ROOT_ATTR}] .mp-leg-pose { transform-origin: 19px 21px; }
[${ROOT_ATTR}] .mp-tail-pose { transform-origin: 12px 19px; }
[${ROOT_ATTR}] :is([data-mode="press"], [data-mode="carry"]) .mp-head { transform: rotate(-11deg) translateY(-1px); }
[${ROOT_ATTR}] [data-mode="press"] .mp-front { transition-duration: .38s; transform: rotate(-95deg); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-front { opacity: 0; transform: rotate(-150deg); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-grip { opacity: 1; }
[${ROOT_ATTR}] [data-mode="carry"] .mp-far-front { opacity: 0; }
[${ROOT_ATTR}] [data-mode="carry"] .mp-head { transform: translateY(-1px) rotate(10deg); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-leg-pose { transform: translate(-1px, 1px) rotate(var(--mp-leg-swing, 0deg)); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-tail-pose { transform: rotate(var(--mp-tail-swing, 0deg)); }
[${ROOT_ATTR}] :is([data-mode="carry"], [data-mode="fall"]) .mp-pose {
  transform-origin: 33px 4px;
  transform: rotate(var(--mp-swing, 0deg)) scale(var(--mp-body-width, 1), var(--mp-body-height, 1));
  transition: none;
}
[${ROOT_ATTR}] [data-mode="sniff"] .mp-head { transform: translateX(var(--mp-sniff, 0px)) rotate(5deg); }
[${ROOT_ATTR}] [data-mode="rear"] .mp-pose { transform-origin: 17px 27px; transform: rotate(-19deg) scale(.96, 1.07); }
[${ROOT_ATTR}] [data-mode="rear"] .mp-head { transform: rotate(-10deg) translateY(-1px); }
[${ROOT_ATTR}] [data-mode="rear"] .mp-front { transform: rotate(-84deg); }
[${ROOT_ATTR}] [data-mode="land"] .mp-pose { animation: mp-land ${LAND_MS}ms ease-out; }
[${ROOT_ATTR}] [data-mode="skid"] .mp-pose { animation: mp-skid .26s ease-in-out; }
[${ROOT_ATTR}] [data-mode="skid"] .mp-leg-pose { animation: mp-skid-feet .26s ease-in-out; }
[${ROOT_ATTR}] [data-mode="skid"] .mp-tail-pose { animation: mp-skid-tail .26s ease-out; }
[${ROOT_ATTR}] [data-mode="stretch"] .mp-pose { animation: mp-stretch .62s ease-in-out both; }
[${ROOT_ATTR}] [data-mode="stretch"] .mp-front { animation: mp-stretch-paw .62s ease-in-out; }

[${ROOT_ATTR}] [data-mode="sit"] .mp-head { transform: translateY(-1px) rotate(-6deg); }
[${ROOT_ATTR}] [data-mode="groom"] .mp-head { transform: translate(-.6px, .3px) rotate(6deg); }
[${ROOT_ATTR}] [data-mode="groom"] .mp-front { transform: rotate(-104deg); }
[${ROOT_ATTR}] :is([data-mode="sleep"], [data-mode="stretch"]) .mp-eye-state { opacity: 0; }
[${ROOT_ATTR}] :is([data-mode="sleep"], [data-mode="stretch"]) .mp-eye-closed { opacity: 1; }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-pose {
  transform: translateY(2px) scale(1.03, .88); transition-duration: .36s;
}
[${ROOT_ATTR}] [data-mode="sleep"] .mp-head { transform: translate(-1px, 1px) rotate(10deg); }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-front { transform: rotate(-35deg); }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-leg-pose { transform: translateY(-2px) scaleY(.65); }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-tail-pose { transform: rotate(-25deg); }
[${ROOT_ATTR}] .mp-doze { transform-box: view-box; transform-origin: 24px 28px; transform: scaleY(var(--mp-breath, 1)); }
[${ROOT_ATTR}] .mp-z {
  opacity: 0; position: absolute; left: 100%; bottom: 60%; margin-left: -4px;
  font: 600 11px/1 ui-monospace, monospace; color: var(--muted-foreground);
}
[${ROOT_ATTR}] [data-mode="sleep"] .mp-z { animation: mp-z 2.6s .45s ease-out infinite; }

[${ROOT_ATTR}] .mp-squeak {
  display: none; position: absolute; left: 50%; bottom: 100%; margin-bottom: 4px; padding: 2px 7px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--popover); color: var(--popover-foreground);
  font: 600 11px/1.3 system-ui, sans-serif; white-space: nowrap; transform: translateX(-50%);
  box-shadow: 0 2px 8px rgb(0 0 0 / .2);
}
[${ROOT_ATTR}] .mp-squeak[data-visible] { display: block; animation: mp-pop ${SQUEAK_MS}ms ease-out; }

@keyframes mp-blink { 0%, 89%, 94%, 100% { transform: scaleY(1); } 91% { transform: scaleY(.12); } }
@keyframes mp-hop-impact {
  0%, 100% { transform: none; }
  12% { transform: scale(1.05, .83); }
  29% { transform: scale(.98, 1.09); }
  65% { transform: scale(.99, 1.035); }
  90% { transform: scale(1.06, .85); }
}
@keyframes mp-land {
  0%, 100% { transform: none; }
  25% { transform: scale(1.09, .84); }
  65% { transform: scale(.99, 1.025); }
}
@keyframes mp-skid { 0%, 100% { transform: none; } 42% { transform: translate(-1px, 1px) scale(1.06, .94); } }
@keyframes mp-skid-feet { 0%, 100% { transform: none; } 45% { transform: translateX(2px) rotate(-15deg); } }
@keyframes mp-skid-tail { 0%, 100% { transform: none; } 44% { transform: rotate(28deg); } }
@keyframes mp-stretch { 0% { transform: translateY(2px) scale(1.03, .88); } 50% { transform: translate(1px, 1px) skewY(4deg) scale(1.09, .91); } 100% { transform: none; } }
@keyframes mp-stretch-paw { 0%, 100% { transform: none; } 50% { transform: rotate(-33deg); } }
@keyframes mp-z { from { opacity: 0; transform: translate(0, 4px); } 25% { opacity: 1; } to { opacity: 0; transform: translate(5px, -9px); } }
@keyframes mp-pop { from { opacity: 0; transform: translate(-50%, 4px); } 15% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } to { opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  [${ROOT_ATTR}] * { animation: none !important; transition: none !important; }
}
`;

const SPRITE = `
<svg class="mp-profile" viewBox="0 0 48 29" aria-hidden="true" focusable="false">
  <g class="mp-impact">
    <g class="mp-pose">
      <g class="mp-tail-pose">
        <path class="mp-tail" d="M12 19C5 20 2 14 6 9" fill="none" stroke="${PINK}" stroke-width="1.8" stroke-linecap="round"/>
      </g>
      <g class="mp-figure">
        <g class="mp-leg-pose" stroke-linecap="round" stroke-width="2.6">
          <path class="mp-leg" d="M16 21q-1 5 0 6.5h1.4" stroke="${FUR_FAR}" fill="none" style="transform-origin:16px 21px"/>
          <g class="mp-far-front"><path class="mp-leg" d="M31 21q-1 5 0 6.5h1.4" stroke="${FUR_FAR}" fill="none" style="transform-origin:31px 21px"/></g>
          <path class="mp-leg" d="M20 21q-1 5 0 6.5h1.4" stroke="${FUR}" fill="none" style="transform-origin:20px 21px"/>
        </g>
        <g class="mp-doze">
          <ellipse cx="23" cy="17" rx="14.5" ry="7.5" fill="${FUR}"/>
          <g class="mp-head">
            <ellipse cx="38" cy="16" rx="7.5" ry="5.4" fill="${FUR}"/>
            <circle cx="33.5" cy="9.6" r="4.3" fill="${FUR}"/>
            <circle cx="33.5" cy="9.6" r="2.6" fill="${PINK}"/>
            <circle cx="45" cy="17" r="1.6" fill="${PINK}"/>
            <path d="M42 18.4 47.5 17.2M42 19.2 47.5 20.6" fill="none" stroke="${FUR_FAR}" stroke-width=".6" stroke-linecap="round"/>
            <g class="mp-eye-state"><circle class="mp-eye" cx="38" cy="14.5" r="1.2" fill="${INK}"/></g>
            <path class="mp-eye-closed" d="M36.6 14.7q1.4 1.1 2.8 0" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>
          </g>
        </g>
        <g class="mp-front">
          <g class="mp-wash">
            <path class="mp-leg" d="M35 21q-.8 4.6.4 6.5h1.4" fill="none" stroke="${FUR}" stroke-width="2.6" stroke-linecap="round" style="transform-origin:35px 21px"/>
          </g>
        </g>
        <g class="mp-grip" fill="none" stroke-width="2.5" stroke-linecap="round">
          <path d="M29 15Q27 8 31 5" stroke="${FUR_FAR}"/>
          <path d="M34 18Q38 9 33 4" stroke="${FUR}"/>
        </g>
      </g>
    </g>
  </g>
</svg>`;

const FRONT_SPRITE = `
<svg class="mp-anfas" viewBox="0 0 48 29" aria-hidden="true" focusable="false">
  <path d="M20 24q-6 1-9-3" stroke="${PINK}" stroke-width="1.7" stroke-linecap="round" fill="none"/>
  <path d="M19 24l-1 3.5h2m9-3.5 1 3.5h-2" stroke="${FUR_FAR}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <ellipse cx="24" cy="18.5" rx="9" ry="7.5" fill="${FUR}"/>
  <circle cx="18.4" cy="10.5" r="3.9" fill="${FUR}"/>
  <circle cx="29.6" cy="10.5" r="3.9" fill="${FUR}"/>
  <circle cx="18.4" cy="10.5" r="2.25" fill="${PINK}"/>
  <circle cx="29.6" cy="10.5" r="2.25" fill="${PINK}"/>
  <ellipse cx="24" cy="16.5" rx="7.8" ry="6" fill="${FUR}"/>
  <circle cx="20.8" cy="15.3" r="1.1" fill="${INK}"/>
  <circle cx="27.2" cy="15.3" r="1.1" fill="${INK}"/>
  <ellipse cx="24" cy="18.8" rx="1.6" ry="1.35" fill="${PINK}"/>
  <path d="M21.5 19.5l-5-1m5 2-5 1m10-2 5-1m-5 2 5 1" stroke="${FUR_FAR}" stroke-width=".6" stroke-linecap="round" fill="none"/>
</svg>`;

function prefersReducedMotion(): MediaQueryList {
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

const viewportWidth = () => document.documentElement.clientWidth;
const viewportHeight = () => document.documentElement.clientHeight;

type Gesture = {
  pointerId: number;
  started: number;
  point: Point;
  phase: "press" | "carry";
  pickedUpAt: number;
  velocity: Point;
  movedAt: number;
};

type Attention = {
  phase: "approach" | "sniff" | "rear";
  started: number;
  point: Point;
  fromX: number;
  toX: number;
};

export function mountMousePet({ signal }: { signal: AbortSignal }): () => void {
  const style = document.createElement("style");
  style.textContent = STYLE;
  const root = document.createElement("div");
  root.setAttribute(ROOT_ATTR, "");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<div class="mp-mouse" data-mode="walk"><span class="mp-squeak">Pi!</span><span class="mp-z">z</span><div class="mp-hop"><div class="mp-flip" data-dir="1">${SPRITE}${FRONT_SPRITE}</div></div></div>`;
  const mouse = root.querySelector<HTMLElement>(".mp-mouse")!;
  const hop = root.querySelector<HTMLElement>(".mp-hop")!;
  const flip = root.querySelector<HTMLElement>(".mp-flip")!;
  const squeak = root.querySelector<HTMLElement>(".mp-squeak")!;
  const legs = Array.from(root.querySelectorAll<SVGElement>(".mp-leg"));
  document.head.append(style);
  document.body.append(root);

  let pet: Pet = createPet(viewportWidth(), Math.random);
  let frame = 0;
  let lastTime = 0;
  let gesture: Gesture | null = null;
  let cursor: { point: Point; since: number; visited: boolean } | null = null;
  let attention: Attention | null = null;
  let descent: { phase: "fall" | "land"; elapsed: number; lift: number; x: number; vx: number; vy: number } | null = null;
  let lift = 0;
  let swing = 0;
  let swingVelocity = 0;
  let tuck = 0;
  let stretch = 0;
  let clickTimer = 0;
  let hopStarted: number | null = null;
  let hopLift = 0;
  let hopStartHeight = 0;
  let stride = 0;
  let gaitSpeed = 0;
  let face: number = pet.direction;
  let turn = { from: face, to: face, progress: 1 };
  let rest = 0;
  let tailPhase = 0;
  let wash = 0;
  const motion = prefersReducedMotion();

  const render = () => {
    mouse.style.transform = `translate3d(${pet.x.toFixed(2)}px, ${(-(lift + hopLift)).toFixed(2)}px, 0)`;
    const mode = motion.matches ? "sit" : gesture?.phase ?? descent?.phase ?? attention?.phase ?? pet.mode;
    if (mouse.dataset.mode !== mode) mouse.dataset.mode = mode;
    mouse.toggleAttribute("data-moving", gaitSpeed > 4);
    if (mode === "carry" || mode === "fall") {
      const angle = swing - 27 * tuck;
      mouse.style.setProperty("--mp-swing", `${angle.toFixed(2)}deg`);
      mouse.style.setProperty("--mp-leg-swing", `${((14 * tuck - swing) * .84).toFixed(2)}deg`);
      mouse.style.setProperty("--mp-tail-swing", `${(swing * 1.35 + 8 * tuck).toFixed(2)}deg`);
      mouse.style.setProperty("--mp-body-width", (1 - .06 * tuck).toFixed(3));
      mouse.style.setProperty("--mp-body-height", (1 + .12 * tuck + stretch).toFixed(3));
    }
    const direction = String(pet.direction);
    if (flip.dataset.dir !== direction) flip.dataset.dir = direction;
  };

  const sit = () => { pet = { ...pet, velocity: 0, mode: "sit", remainingMs: 900 }; };

  const drawMotion = (time: number, dt: number, distance: number) => {
    const movingOnFloor = !gesture && !descent && pet.mode !== "skid" && (!attention || attention.phase === "approach");
    const speed = movingOnFloor && dt > 0 ? distance * 1_000 / dt : 0;
    gaitSpeed += (speed - gaitSpeed) * (1 - Math.exp(-dt / 44));
    const stepLength = 15 + Math.min(gaitSpeed / 150, 1) * 12;
    stride = (stride + (movingOnFloor ? distance : 0) / stepLength) % 1;
    const gait = gaitFrame(stride, gaitSpeed);
    const dozing = !gesture && pet.mode === "sleep";
    rest += ((dozing ? 1 : 0) - rest) * (1 - Math.exp(-dt / 140));
    tailPhase = (tailPhase + dt / (240 + rest * 430)) % (Math.PI * 2);
    const tail = gait.tail + Math.sin(tailPhase) * (3.2 - rest * 1.7);
    const breath = 1 + rest * .038 * (1 - Math.cos(time / 440)) / 2;
    const washTarget = !gesture && pet.mode === "groom" ? -14 * (1 - Math.cos(time / 83)) : 0;
    wash += (washTarget - wash) * (1 - Math.exp(-dt / 40));
    mouse.style.setProperty("--mp-tail", `${tail.toFixed(2)}deg`);
    mouse.style.setProperty("--mp-breath", breath.toFixed(3));
    mouse.style.setProperty("--mp-wash", `${wash.toFixed(2)}deg`);
    if (attention?.phase === "sniff") {
      const progress = Math.min((time - attention.started) / SNIFF_MS, 1);
      const reach = 4 * Math.sin(Math.PI * progress) * (.72 + .28 * Math.sin(progress * 4 * Math.PI) ** 2);
      mouse.style.setProperty("--mp-sniff", `${reach.toFixed(2)}px`);
    }
    legs.forEach((leg, index) => {
      const foot = gait.feet[index];
      leg.style.transform = `translateY(${(-foot.lift).toFixed(2)}px) rotate(${foot.angle.toFixed(2)}deg)`;
    });
    const facing = Math.abs(pet.velocity) < 9 ? pet.direction : Math.sign(pet.velocity);
    if (turn.to !== facing) turn = { from: face, to: facing, progress: 0 };
    turn.progress = Math.min(1, turn.progress + dt / 185);
    const view = turnFrame(turn.from, turn.to, turn.progress);
    face = view.yaw;
    flip.style.setProperty("--mp-turn", String((face < 0 ? -1 : 1) * view.width));
    flip.style.setProperty("--mp-profile", view.profile.toFixed(3));

    if (hopStarted !== null) {
      const progress = (time - hopStarted) / HOP_MS;
      hopLift = hopHeight(progress, hopStartHeight);
      if (progress >= 1) hopStarted = null;
    }
  };

  const placeAtGrip = (blend: number) => {
    if (!gesture) return;
    const position = carryPosition(gesture.point, pet.direction, viewportWidth(), viewportHeight());
    pet.x += (position.x - pet.x) * blend;
    lift += (position.lift - lift) * blend;
  };

  const cursorVelocity = (pointer: Gesture, time: number) => {
    const decay = Math.exp(-Math.max(time - pointer.movedAt - 24, 0) / 78);
    return { x: pointer.velocity.x * decay, y: pointer.velocity.y * decay };
  };

  const trackPointer = (pointer: Gesture, point: Point) => {
    if (point.x === pointer.point.x && point.y === pointer.point.y) return;
    const time = performance.now();
    const elapsed = Math.max(time - pointer.movedAt, 8);
    const last = cursorVelocity(pointer, time);
    const blend = 1 - Math.exp(-elapsed / 30);
    const vx = (point.x - pointer.point.x) * 1_000 / elapsed;
    const vy = (point.y - pointer.point.y) * 1_000 / elapsed;
    pointer.velocity = { x: last.x + (vx - last.x) * blend, y: last.y + (vy - last.y) * blend };
    pointer.movedAt = time;
    pointer.point = point;
  };

  const updateGesture = (time: number, dt: number) => {
    if (!gesture) return;
    if (gesture.phase === "press" && lift > 0) lift = Math.max(0, lift - dt * .13);
    if (gesture.phase === "press" && time - gesture.started >= HOLD_MS) {
      gesture.phase = "carry";
      gesture.pickedUpAt = time;
    }
    if (gesture.phase === "carry") {
      const age = time - gesture.pickedUpAt;
      tuck = Math.min(age / 170, 1);
      placeAtGrip(age >= 190 ? 1 : 1 - Math.exp(-dt / 42));
      const speed = cursorVelocity(gesture, time);
      const target = Math.max(-14, Math.min(14, speed.x / 48)) * pet.direction;
      const extension = Math.max(-.11, Math.min(.17, -speed.y / 3_500));
      const step = Math.min(dt / 1000, .032);
      swingVelocity += ((target - swing) * 225 - swingVelocity * 19) * step;
      swing += swingVelocity * step;
      stretch += (extension - stretch) * (1 - Math.exp(-dt / 55));
    }
  };

  const updateAttention = (time: number) => {
    if (attention) {
      const elapsed = time - attention.started;
      if (attention.phase === "approach") {
        const progress = Math.min(elapsed / APPROACH_MS, 1);
        const eased = progress * progress * (3 - 2 * progress);
        pet.x = attention.fromX + (attention.toX - attention.fromX) * eased;
        if (progress === 1) {
          attention.phase = "sniff";
          attention.started = time;
        }
      } else if (elapsed >= (attention.phase === "sniff" ? SNIFF_MS : REAR_MS)) {
        attention = null;
      }
      return true;
    }
    if (!cursor || cursor.visited || time - cursor.since < SNIFF_DWELL_MS ||
        pet.mode === "sleep" || pet.mode === "stretch" || pet.mode === "skid" || pet.mode === "run") return false;
    const distance = sniffDistance(pet.x, pet.direction, cursor.point, viewportHeight());
    if (distance === null) return false;
    cursor.visited = true;
    const toX = Math.max(0, Math.min(pet.x + pet.direction * (distance - 3), maxX(viewportWidth())));
    attention = { phase: "approach", started: time, point: cursor.point, fromX: pet.x, toX };
    sit();
    return true;
  };

  const updateDescent = (dt: number) => {
    if (!descent) return;
    descent.elapsed += dt;
    if (descent.phase === "fall") {
      const position = fallFrame(descent.lift, descent.x, descent.vx, descent.vy, descent.elapsed / 1_000);
      lift = Math.min(maxLift(viewportHeight()), position.lift);
      pet.x = Math.max(0, Math.min(maxX(viewportWidth()), position.x));
      const settle = lift === 0 ? 1 : Math.min(dt / 85, 1);
      swing *= Math.max(0, 1 - settle);
      tuck *= Math.max(0, 1 - settle);
      stretch *= Math.max(0, 1 - settle);
      if (lift === 0) descent = { ...descent, phase: "land", elapsed: 0 };
    } else if (descent.elapsed >= LAND_MS) {
      descent = null;
    }
  };

  const tick = (time: number) => {
    const dt = lastTime === 0 ? 0 : Math.min(time - lastTime, MAX_FRAME_MS);
    lastTime = time;
    const x = pet.x;
    if (gesture) updateGesture(time, dt);
    else if (descent) updateDescent(dt);
    else if (!updateAttention(time)) pet = advance(pet, dt, viewportWidth(), Math.random);
    drawMotion(time, dt, Math.abs(pet.x - x));
    render();
    frame = requestAnimationFrame(tick);
  };
  const stopLoop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  };
  const syncMotion = () => {
    cancelInteraction();
    stopLoop();
    if (motion.matches) {
      sit();
      gaitSpeed = 0;
      flip.style.setProperty("--mp-turn", String(pet.direction));
      flip.style.setProperty("--mp-profile", "1");
      mouse.style.removeProperty("--mp-tail");
      mouse.style.removeProperty("--mp-breath");
      mouse.style.removeProperty("--mp-wash");
      legs.forEach((leg) => leg.style.removeProperty("transform"));
      render();
    } else {
      frame = requestAnimationFrame(tick);
    }
  };

  const clearClick = () => {
    window.clearTimeout(clickTimer);
    hopStarted = null;
    hopLift = hopStartHeight = 0;
    hop.removeAttribute("data-hop");
    squeak.removeAttribute("data-visible");
  };
  const reactToClick = () => {
    clearClick();
    void hop.offsetWidth;
    hop.setAttribute("data-hop", "");
    squeak.setAttribute("data-visible", "");
    clickTimer = window.setTimeout(clearClick, SQUEAK_MS);
    if (!motion.matches) {
      hopStartHeight = hopLift = lift;
      lift = 0;
      hopStarted = performance.now();
      pet = startle(pet);
    }
  };
  const releaseCapture = () => {
    const pointerId = gesture?.pointerId;
    gesture = null;
    if (pointerId !== undefined && mouse.hasPointerCapture(pointerId)) mouse.releasePointerCapture(pointerId);
  };
  const cancelInteraction = () => {
    if (gesture || descent) sit();
    releaseCapture();
    attention = cursor = descent = null;
    swing = swingVelocity = tuck = stretch = lift = 0;
    clearClick();
    render();
  };
  const onDown = (event: PointerEvent) => {
    if (gesture || !event.isPrimary || event.button !== 0 || descent) return;
    event.preventDefault();
    lift = Math.min(hopLift, maxLift(viewportHeight()));
    clearClick();
    pet = { ...pet, velocity: 0, direction: face < 0 ? -1 : 1 };
    attention = cursor = null;
    mouse.setPointerCapture(event.pointerId);
    const time = performance.now();
    gesture = {
      pointerId: event.pointerId, started: time, movedAt: time, velocity: { x: 0, y: 0 },
      point: { x: event.clientX, y: event.clientY }, phase: "press", pickedUpAt: 0,
    };
    if (!motion.matches) render();
  };
  const onMove = (event: PointerEvent) => {
    const point = { x: event.clientX, y: event.clientY };
    if (gesture?.pointerId === event.pointerId) {
      trackPointer(gesture, point);
      if ((event.buttons & 1) === 0) finishGesture(false);
      else if (gesture.phase === "carry" && performance.now() - gesture.pickedUpAt >= 190) {
        placeAtGrip(1);
        render();
      }
      return;
    }
    if (motion.matches || gesture || event.pointerType !== "mouse") return;
    if (event.buttons !== 0) {
      clearAttention();
      return;
    }
    if (attention?.phase === "sniff" && Math.abs(point.x - attention.point.x) <= 9 &&
        point.y <= attention.point.y - 7 && point.y >= attention.point.y - 32) {
      attention.phase = "rear";
      attention.started = performance.now();
    } else if (attention && (Math.abs(point.x - attention.point.x) > 9 ||
        Math.abs(point.y - attention.point.y) > (attention.phase === "rear" ? 32 : 9))) {
      attention = null;
    }
    if (!cursor || Math.hypot(point.x - cursor.point.x, point.y - cursor.point.y) > 5) {
      cursor = { point, since: performance.now(), visited: false };
    }
  };
  const finishGesture = (canClick: boolean) => {
    if (!gesture) return;
    const held = !motion.matches && performance.now() - gesture.started >= HOLD_MS;
    const carrying = gesture.phase === "carry";
    const speed = carrying ? cursorVelocity(gesture, performance.now()) : { x: 0, y: 0 };
    releaseCapture();
    if (!carrying && canClick && !held) {
      reactToClick();
    } else if (carrying || lift > 0) {
      sit();
      if (lift > 4 || speed.y < -160) {
        const headroom = Math.max(0, maxLift(viewportHeight()) - lift);
        const vy = Math.min(-speed.y, Math.sqrt(2 * FALL_GRAVITY * headroom));
        descent = { phase: "fall", elapsed: 0, x: pet.x, lift, vx: speed.x, vy };
      } else {
        lift = 0;
        swing = tuck = stretch = 0;
      }
      swingVelocity = 0;
    }
    render();
  };
  const onUp = (event: PointerEvent) => {
    if (gesture?.pointerId !== event.pointerId || event.button !== 0) return;
    trackPointer(gesture, { x: event.clientX, y: event.clientY });
    finishGesture(true);
  };
  const onCancel = (event: PointerEvent) => {
    if (gesture?.pointerId === event.pointerId) cancelInteraction();
  };
  const clearAttention = () => { attention = cursor = null; };
  const onVisibility = () => { if (document.hidden) cancelInteraction(); };
  const onResize = () => {
    clearAttention();
    pet = fit(pet, viewportWidth());
    if (gesture?.phase === "carry") placeAtGrip(1);
    lift = Math.min(lift, maxLift(viewportHeight()));
    render();
  };

  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  mouse.addEventListener("pointerdown", onDown, options);
  mouse.addEventListener("pointerup", onUp, options);
  mouse.addEventListener("pointercancel", onCancel, options);
  mouse.addEventListener("lostpointercapture", onCancel, options);
  window.addEventListener("pointermove", onMove, { ...options, capture: true });
  document.documentElement.addEventListener("pointerleave", clearAttention, options);
  document.addEventListener("visibilitychange", onVisibility, options);
  window.addEventListener("blur", cancelInteraction, options);
  window.addEventListener("resize", onResize, options);
  motion.addEventListener("change", syncMotion, options);
  flip.style.setProperty("--mp-turn", String(face));
  render();
  syncMotion();

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopLoop();
    listeners.abort();
    releaseCapture();
    clearClick();
    signal.removeEventListener("abort", dispose);
    root.remove();
    style.remove();
  };
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) dispose();
  return dispose;
}
