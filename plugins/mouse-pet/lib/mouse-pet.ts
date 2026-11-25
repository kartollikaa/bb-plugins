import { advance, createPet, fit, maxX, MAX_FRAME_MS, PET_WIDTH, startle, type Pet } from "./pet.ts";
import {
  carryPosition, DRAG_START_PX, FLOOR_GAP, GRIP_X, GRIP_Y, gripPoint, LONG_PRESS_MS,
  maxLift, PET_HEIGHT, screenGripX, scruffPath, sniffDistance, type Point,
} from "./interaction.ts";
import { FALL_GRAVITY, fallFrame, followSpring, gaitFrame, hopHeight, HOP_TOUCHDOWN, strideLength, turnFrame, type Spring } from "./animation.ts";
import { advanceSnack, BITE_MS, biteMaskPath, CHEESE_WIDTH, createSnack, interruptSnack, resizeSnack } from "./snack.ts";

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

const PAWS = [
  { x: 16, y: 21.3, hock: -1.25, toe: 1.35 },
  { x: 31, y: 20.6, hock: .35, toe: .95 },
  { x: 20, y: 21.4, hock: -1.45, toe: 1.55 },
  { x: 35, y: 20.9, hock: .3, toe: 1.05 },
] as const;

function pawPath(index: number, reach = 0, lift = 0) {
  const { x, y, hock, toe } = PAWS[index];
  const footX = (x + reach).toFixed(2);
  const footY = (27.2 - lift).toFixed(2);
  const bend = (x + hock + reach * .42).toFixed(2);
  return `M${x} ${y}Q${bend} ${(24.6 - lift * .42).toFixed(2)} ${footX} ${footY}q${toe * .5} .55 ${toe} .2`;
}

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
[${ROOT_ATTR}] .mp-flip {
  position: relative; isolation: isolate; transform: translateY(var(--mp-bound, 0px));
}
[${ROOT_ATTR}] .mp-profile { transform: scaleX(var(--mp-turn, 1)); opacity: var(--mp-profile, 1); }
[${ROOT_ATTR}] :is(.mp-anfas, .mp-rear-view) {
  position: absolute; inset: 0; opacity: calc(1 - var(--mp-profile, 1)); mix-blend-mode: plus-lighter;
}
[${ROOT_ATTR}] .mp-rear-view, [${ROOT_ATTR}] [data-depth-view="back"] .mp-anfas { display: none; }
[${ROOT_ATTR}] [data-depth-view="back"] .mp-rear-view { display: block; }
[${ROOT_ATTR}] .mp-rear-tail {
  transform-box: view-box; transform-origin: 24.1px 24.1px; transform: rotate(var(--mp-rear-tail, 0deg));
}
[${ROOT_ATTR}] .mp-hop[data-hop] .mp-impact { animation: mp-hop-impact ${HOP_MS}ms ease-in-out both; }
[${ROOT_ATTR}] svg { overflow: visible; }
[${ROOT_ATTR}] .mp-cheese {
  position: absolute; left: 0; bottom: ${FLOOR_GAP}px; width: ${CHEESE_WIDTH}px; height: ${PET_HEIGHT}px;
  pointer-events: none;
}
[${ROOT_ATTR}] .mp-cheese[data-edge="1"] svg { transform: scaleX(-1); }

[${ROOT_ATTR}] .mp-tail, [${ROOT_ATTR}] .mp-eye,
[${ROOT_ATTR}] .mp-impact, [${ROOT_ATTR}] .mp-wash { transform-box: view-box; }
[${ROOT_ATTR}] .mp-tail { transform-origin: 12px 19px; transform: rotate(var(--mp-tail, 0deg)); }
[${ROOT_ATTR}] .mp-eye { transform-origin: 38px 14.5px; }
[${ROOT_ATTR}] [data-mode="sit"]:not([data-moving]) .mp-eye { animation: mp-blink 3.8s .7s infinite; }
[${ROOT_ATTR}] .mp-eye-state, [${ROOT_ATTR}] .mp-eye-closed { transition: opacity .18s ease, transform .18s ease; }
[${ROOT_ATTR}] .mp-eye-closed { opacity: 0; }
[${ROOT_ATTR}] .mp-impact { transform-origin: 24px 28px; }
[${ROOT_ATTR}] :is([data-mode="press"], [data-mode="carry"]) { cursor: grabbing; }
[${ROOT_ATTR}] .mp-pose, [${ROOT_ATTR}] .mp-head, [${ROOT_ATTR}] .mp-front,
[${ROOT_ATTR}] .mp-scruff, [${ROOT_ATTR}] .mp-leg-pose, [${ROOT_ATTR}] .mp-tail-pose, [${ROOT_ATTR}] .mp-far-front {
  transform-box: view-box;
  transition: transform .16s ease-out, opacity .16s ease-out;
}
[${ROOT_ATTR}] .mp-pose { transform-origin: 24px 28px; }
[${ROOT_ATTR}] .mp-head { transform-origin: 32px 17px; }
[${ROOT_ATTR}] .mp-front { transform-origin: 35px 21px; }
[${ROOT_ATTR}] .mp-wash { transform-origin: 35px 21px; transform: rotate(var(--mp-wash, 0deg)); }
[${ROOT_ATTR}] .mp-scruff { opacity: 0; transition-duration: .09s; }
[${ROOT_ATTR}] .mp-leg-pose { transform-origin: 19px 21px; }
[${ROOT_ATTR}] .mp-tail-pose { transform-origin: 12px 19px; }
[${ROOT_ATTR}] [data-mode="press"] .mp-head { transform: rotate(-7deg) translateY(-.6px); }
[${ROOT_ATTR}] [data-mode="press"] .mp-front { transition-duration: .09s; transform: rotate(-12deg); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-front { transform: translate(.3px, .9px) rotate(17deg); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-scruff { opacity: 1; }
[${ROOT_ATTR}] [data-mode="carry"] .mp-far-front { transform: translate(.8px, 1.1px); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-head { transform: translateY(-1px) rotate(10deg); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-leg-pose { transform: translate(-1px, 1px) rotate(var(--mp-leg-swing, 0deg)); }
[${ROOT_ATTR}] [data-mode="carry"] .mp-tail-pose { transform: rotate(var(--mp-tail-swing, 0deg)); }
[${ROOT_ATTR}] :is([data-mode="carry"], [data-mode="fall"]) .mp-pose {
  transform-origin: ${GRIP_X}px ${GRIP_Y}px;
  transform: translate(var(--mp-drag-x, 0px), var(--mp-drag-y, 0px))
    rotate(var(--mp-swing, 0deg)) scale(var(--mp-body-width, 1), var(--mp-body-height, 1));
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
[${ROOT_ATTR}] [data-mode="perch"] .mp-pose {
  transform: translate(-1.5px, 1px) rotate(-12deg) scale(1.02, .97); transition-duration: .24s;
}
[${ROOT_ATTR}] [data-mode="perch"] .mp-head { transform: translate(-.4px, -.8px) rotate(-5deg); }
[${ROOT_ATTR}] [data-mode="perch"] .mp-eye-state { transform: translate(var(--mp-look-x, 0px), var(--mp-look-y, 0px)); }
[${ROOT_ATTR}] [data-mode="perch"] .mp-front { transform: translate(.6px, 1px) rotate(-15deg); }
[${ROOT_ATTR}] [data-mode="perch"] .mp-far-front { transform: translate(-1.3px, .5px); opacity: .72; }
[${ROOT_ATTR}] [data-mode="perch"] .mp-leg-pose { transform: translateY(-1px) scaleY(.83); }
[${ROOT_ATTR}] [data-mode="perch"] .mp-tail-pose { transform: rotate(-26deg); }
[${ROOT_ATTR}] [data-mode="fetch"] .mp-head { transform: translateX(2px) rotate(9deg); }
[${ROOT_ATTR}] [data-mode="fetch"] .mp-front { transform: rotate(-87deg); }
[${ROOT_ATTR}] [data-mode="eat"] .mp-head { animation: mp-nibble ${BITE_MS}ms ease-in-out infinite; }
[${ROOT_ATTR}] [data-mode="eat"] .mp-front { transform: rotate(-115deg); }
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
  12% { transform: scale(.98, 1.07); }
  65% { transform: scale(1, 1.02); }
  91% { transform: scale(1.045, .91); }
}
@keyframes mp-nibble {
  0%, 100% { transform: translateY(1px) rotate(6deg); }
  35% { transform: translate(1px, 1.7px) rotate(11deg); }
  60% { transform: translateY(.6px) rotate(4deg); }
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
        <g class="mp-leg-pose" stroke-linecap="round" fill="none">
          <path class="mp-leg" d="${pawPath(0)}" stroke="${FUR_FAR}" stroke-width="2.05"/>
          <g class="mp-far-front"><path class="mp-leg" d="${pawPath(1)}" stroke="${FUR_FAR}" stroke-width="1.65"/></g>
          <path class="mp-leg" d="${pawPath(2)}" stroke="${FUR}" stroke-width="2.25"/>
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
            <path class="mp-leg" d="${pawPath(3)}" fill="none" stroke="${FUR}" stroke-width="1.9" stroke-linecap="round"/>
          </g>
        </g>
      </g>
    </g>
    <path class="mp-scruff" fill="${FUR}"/>
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

const BACK_SPRITE = `
<svg class="mp-rear-view" viewBox="0 0 48 29" aria-hidden="true" focusable="false">
  <path d="M19 25l-2 2.5h3m9-2.5 2 2.5h-3" stroke="${FUR_FAR}" stroke-width="2.8" stroke-linecap="round" fill="none"/>
  <circle cx="18.3" cy="10.6" r="3.8" fill="${FUR_FAR}"/>
  <circle cx="29.7" cy="10.6" r="3.8" fill="${FUR_FAR}"/>
  <ellipse cx="24" cy="15.2" rx="7.5" ry="6.5" fill="${FUR}"/>
  <ellipse cx="24" cy="20.2" rx="10.3" ry="7" fill="${FUR}"/>
  <path class="mp-rear-tail" d="M24.1 24.1c-.4 4.1 9.7 5.5 12.6 1.2 1.3-2 0-3.4-.9-4.1" stroke="${PINK}" stroke-width="1.7" stroke-linecap="round" fill="none"/>
</svg>`;

const CHEESE = `
<div class="mp-cheese" hidden>
  <svg viewBox="0 0 48 29" aria-hidden="true" focusable="false">
    <mask id="mp-cheese-bites" maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="29">
      <rect width="48" height="29" fill="white"/>
      <path class="mp-cheese-bites" fill="black"/>
    </mask>
    <g mask="url(#mp-cheese-bites)">
      <path d="M2.5 14.5 45.5 12v11.7L2.5 27z" fill="#efab39" stroke="#b96b24" stroke-width=".85" stroke-linejoin="round"/>
      <path d="M2.5 14.5 31 2.6 45.5 12 2.5 16.3z" fill="#ffdb73" stroke="#b96b24" stroke-width=".85" stroke-linejoin="round"/>
      <ellipse cx="12.5" cy="21.4" rx="3.5" ry="2.65" fill="#ce8229"/>
      <ellipse cx="24.5" cy="9.6" rx="3.1" ry="1.55" fill="#e3a242"/>
      <ellipse cx="29" cy="18.8" rx="3.1" ry="2.15" fill="#ce8229"/>
      <ellipse cx="34.5" cy="8.2" rx="1.65" ry=".95" fill="#edb346"/>
    </g>
  </svg>
</div>`;

function prefersReducedMotion(): MediaQueryList {
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

const viewportWidth = () => document.documentElement.clientWidth;
const viewportHeight = () => document.documentElement.clientHeight;

type Gesture = {
  pointerId: number;
  started: number;
  point: Point;
  start: Point;
  gripOffset: Point;
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
  root.innerHTML = `${CHEESE}<div class="mp-mouse" data-mode="walk"><span class="mp-squeak">Pi!</span><span class="mp-z">z</span><div class="mp-hop"><div class="mp-flip" data-dir="1">${SPRITE}${FRONT_SPRITE}${BACK_SPRITE}</div></div></div>`;
  const mouse = root.querySelector<HTMLElement>(".mp-mouse")!;
  const hop = root.querySelector<HTMLElement>(".mp-hop")!;
  const flip = root.querySelector<HTMLElement>(".mp-flip")!;
  const squeak = root.querySelector<HTMLElement>(".mp-squeak")!;
  const legs = Array.from(root.querySelectorAll<SVGElement>(".mp-leg"));
  const scruff = root.querySelector<SVGElement>(".mp-scruff")!;
  const cheese = root.querySelector<HTMLElement>(".mp-cheese")!;
  const biteMask = cheese.querySelector<SVGElement>(".mp-cheese-bites")!;
  document.head.append(style);
  document.body.append(root);

  let pet: Pet = createPet(viewportWidth(), Math.random);
  let snack = createSnack(performance.now());
  let frame = 0;
  let lastTime = 0;
  let gesture: Gesture | null = null;
  let cursor: { point: Point; since: number; visited: boolean } | null = null;
  let attention: Attention | null = null;
  let descent: { phase: "fall" | "land"; started: number; lift: number; x: number; vx: number; vy: number } | null = null;
  let lift = 0;
  let swing: Spring = { value: 0, velocity: 0 };
  let dragX: Spring = { value: 0, velocity: 0 };
  let dragY: Spring = { value: 0, velocity: 0 };
  let tuck = 0;
  let stretch = 0;
  let clickTimer = 0;
  let hopStarted: number | null = null;
  let hopLift = 0;
  let hopStartHeight = 0;
  let stride = 0;
  let gaitSpeed = 0;
  let boundBlend = 1;
  let face: number = pet.direction;
  let turn = { from: face, to: face, progress: 1 };
  let rest = 0;
  let tailPhase = 0;
  let wash = 0;
  const motion = prefersReducedMotion();

  const render = () => {
    mouse.style.transform = `translate3d(${pet.x.toFixed(2)}px, ${(-(lift + hopLift)).toFixed(2)}px, 0)`;
    const snackPose = snack.action?.kind === "seek" ? undefined : snack.action?.kind;
    const mode = motion.matches ? "sit" : gesture?.phase ?? descent?.phase ?? attention?.phase ?? snackPose ?? pet.mode;
    if (mouse.dataset.mode !== mode) mouse.dataset.mode = mode;
    mouse.toggleAttribute("data-moving", gaitSpeed > 4);
    if (mode === "carry" || mode === "fall") {
      const angle = swing.value - 27 * tuck;
      const scale = { x: 1 - .06 * tuck, y: 1 + .12 * tuck + stretch };
      const offset = { x: dragX.value, y: dragY.value };
      mouse.style.setProperty("--mp-swing", `${angle.toFixed(2)}deg`);
      mouse.style.setProperty("--mp-leg-swing", `${((14 * tuck - swing.value) * .84).toFixed(2)}deg`);
      mouse.style.setProperty("--mp-tail-swing", `${(swing.value * 1.35 + 8 * tuck).toFixed(2)}deg`);
      mouse.style.setProperty("--mp-body-width", scale.x.toFixed(3));
      mouse.style.setProperty("--mp-body-height", scale.y.toFixed(3));
      mouse.style.setProperty("--mp-drag-x", `${offset.x.toFixed(2)}px`);
      mouse.style.setProperty("--mp-drag-y", `${offset.y.toFixed(2)}px`);
      scruff.setAttribute("d", scruffPath(angle, scale, offset));
    }
    const direction = String(pet.direction);
    if (flip.dataset.dir !== direction) flip.dataset.dir = direction;
    cheese.hidden = motion.matches || !snack.cheese;
    if (snack.cheese && !cheese.hidden) {
      cheese.style.transform = `translateX(${snack.cheese.x.toFixed(2)}px)`;
      const portion = String(snack.cheese.bites);
      const edge = String(snack.cheese.edge);
      if (cheese.dataset.bites !== portion) {
        cheese.dataset.bites = portion;
        biteMask.setAttribute("d", biteMaskPath(snack.cheese.bites));
      }
      if (cheese.dataset.edge !== edge) cheese.dataset.edge = edge;
    }
  };

  const sit = () => { pet = { ...pet, velocity: 0, mode: "sit", idleView: "profile", remainingMs: 900 }; };

  const showProfile = () => {
    face = pet.direction;
    turn = { from: face, to: face, progress: 1 };
    delete flip.dataset.depthView;
    flip.style.setProperty("--mp-turn", String(face));
    flip.style.setProperty("--mp-profile", "1");
  };

  const drawMotion = (time: number, dt: number, distance: number) => {
    let hopInFlight = false;
    if (hopStarted !== null) {
      const progress = (time - hopStarted) / HOP_MS;
      hopInFlight = progress < HOP_TOUCHDOWN;
      hopLift = hopHeight(progress, hopStartHeight);
      if (progress >= 1) hopStarted = null;
    }
    const movingOnFloor = !gesture && !descent && !hopInFlight && pet.mode !== "skid" && snack.action?.kind !== "eat" &&
      (!attention || attention.phase === "approach");
    const speed = movingOnFloor && dt > 0 ? Math.abs(distance) * 1_000 / dt : 0;
    gaitSpeed += (speed - gaitSpeed) * (1 - Math.exp(-dt / 44));
    const stepLength = strideLength(gaitSpeed);
    const steps = snack.action?.kind === "fetch" ? distance * pet.direction : Math.abs(distance);
    stride = (stride + (movingOnFloor ? steps : 0) / stepLength + 1) % 1;
    const gait = gaitFrame(stride, gaitSpeed);
    const grounded = movingOnFloor && hopStarted === null && pet.mode === "run";
    boundBlend += ((grounded ? 1 : 0) - boundBlend) * (1 - Math.exp(-dt / 36));
    const bound = gait.bound * boundBlend;
    flip.style.setProperty("--mp-bound", `${(-bound).toFixed(2)}px`);
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
    if (pet.mode === "perch") {
      const point = cursor?.point;
      const x = point ? (point.x - pet.x - PET_WIDTH / 2) * pet.direction / 90 : 0;
      const y = point ? (point.y - viewportHeight() + 18) / 110 : 0;
      mouse.style.setProperty("--mp-look-x", `${Math.max(-1, Math.min(1, x)).toFixed(2)}px`);
      mouse.style.setProperty("--mp-look-y", `${Math.max(-.85, Math.min(.5, y)).toFixed(2)}px`);
    }
    const airborne = Math.min(hopLift / 16, 1);
    legs.forEach((leg, index) => {
      const foot = gait.feet[index];
      const front = index % 2 === 1;
      const reach = foot.reach + airborne * (front ? 1.2 : -.8);
      const raise = foot.lift - bound * foot.contact + airborne * (front ? .8 : 2);
      const shape = pawPath(index, reach, raise);
      if (leg.getAttribute("d") !== shape) leg.setAttribute("d", shape);
    });
    const depthView = !gesture && !attention && !descent && !snack.action && pet.mode === "sit" &&
      Math.abs(pet.velocity) < 9 && pet.idleView !== "profile";
    const facing = depthView ? 0 : Math.abs(pet.velocity) < 9 ? pet.direction : Math.sign(pet.velocity);
    if (depthView) flip.dataset.depthView = pet.idleView;
    if (turn.to !== facing) turn = { from: face, to: facing, progress: 0 };
    turn.progress = Math.min(1, turn.progress + dt / 185);
    const view = turnFrame(turn.from, turn.to, turn.progress);
    face = view.yaw;
    if (!depthView && Math.abs(face) >= .7) delete flip.dataset.depthView;
    if (flip.dataset.depthView === "back") {
      const tailFollow = turn.to === 0 ? 13 * Math.sin(2 * Math.PI * turn.progress) * Math.sin(Math.PI * turn.progress) : 0;
      flip.style.setProperty("--mp-rear-tail", `${tailFollow.toFixed(2)}deg`);
    }
    flip.style.setProperty("--mp-turn", String((face < 0 ? -1 : 1) * view.width));
    flip.style.setProperty("--mp-profile", view.profile.toFixed(3));
  };

  const placeAtGrip = (time: number) => {
    if (!gesture) return;
    const point = gripPoint(gesture.point, gesture.gripOffset, time - gesture.pickedUpAt);
    const position = carryPosition(point, pet.direction, viewportWidth(), viewportHeight());
    pet.x = position.x;
    lift = position.lift;
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
    if (gesture.phase === "carry") {
      const age = time - gesture.pickedUpAt;
      tuck = Math.min(age / 115, 1);
      placeAtGrip(time);
      const speed = cursorVelocity(gesture, time);
      const target = Math.max(-14, Math.min(14, speed.x / 48)) * pet.direction;
      const extension = Math.max(-.11, Math.min(.17, -speed.y / 3_500));
      swing = followSpring(swing, target, dt);
      dragX = followSpring(dragX, Math.max(-8, Math.min(8, -speed.x / 62)) * pet.direction, dt);
      dragY = followSpring(dragY, Math.max(-6, Math.min(6, -speed.y / 82)), dt);
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
        pet.mode === "sleep" || pet.mode === "stretch" || pet.mode === "skid" || pet.mode === "run" ||
        pet.mode === "perch") return false;
    const distance = sniffDistance(pet.x, pet.direction, cursor.point, viewportHeight());
    if (distance === null) return false;
    cursor.visited = true;
    const toX = Math.max(0, Math.min(pet.x + pet.direction * (distance - 3), maxX(viewportWidth())));
    attention = { phase: "approach", started: time, point: cursor.point, fromX: pet.x, toX };
    sit();
    return true;
  };

  const updateDescent = (time: number, dt: number) => {
    if (!descent) return;
    const elapsed = Math.max(time - descent.started, 0);
    if (descent.phase === "fall") {
      const position = fallFrame(descent.lift, descent.x, descent.vx, descent.vy, elapsed / 1_000);
      lift = Math.min(maxLift(viewportHeight()), position.lift);
      pet.x = Math.max(0, Math.min(maxX(viewportWidth()), position.x));
      const settle = lift === 0 ? 1 : Math.min(dt / 85, 1);
      swing = { value: swing.value * (1 - settle), velocity: 0 };
      dragX = { value: dragX.value * (1 - settle), velocity: 0 };
      dragY = { value: dragY.value * (1 - settle), velocity: 0 };
      tuck *= Math.max(0, 1 - settle);
      stretch *= Math.max(0, 1 - settle);
      if (lift === 0 && elapsed > 0) descent = { ...descent, phase: "land", started: time };
    } else if (elapsed >= LAND_MS) {
      descent = null;
    }
  };

  const tick = (time: number) => {
    const dt = lastTime === 0 ? 0 : Math.min(time - lastTime, MAX_FRAME_MS);
    lastTime = time;
    const x = pet.x;
    if (gesture) updateGesture(time, dt);
    else if (descent) updateDescent(time, dt);
    else if (snack.action || !updateAttention(time)) {
      const wasEatingOrFetching = Boolean(snack.action);
      if (hopStarted === null) {
        const next = advanceSnack(snack, pet, time, viewportWidth(), Math.random);
        snack = next.snack;
        pet = next.pet;
      }
      if (!wasEatingOrFetching && !snack.action) pet = advance(pet, dt, viewportWidth(), Math.random);
    }
    drawMotion(time, dt, pet.x - x);
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
      showProfile();
      flip.style.removeProperty("--mp-bound");
      mouse.style.removeProperty("--mp-tail");
      mouse.style.removeProperty("--mp-breath");
      mouse.style.removeProperty("--mp-wash");
      legs.forEach((leg, index) => leg.setAttribute("d", pawPath(index)));
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
      showProfile();
    }
  };
  const releaseCapture = () => {
    const pointerId = gesture?.pointerId;
    gesture = null;
    if (pointerId !== undefined && mouse.hasPointerCapture(pointerId)) mouse.releasePointerCapture(pointerId);
  };
  const resetCarryPose = () => {
    swing = dragX = dragY = { value: 0, velocity: 0 };
    tuck = stretch = 0;
  };
  const cancelInteraction = () => {
    if (gesture || descent) sit();
    releaseCapture();
    attention = cursor = descent = null;
    snack = interruptSnack(snack, performance.now(), viewportWidth());
    resetCarryPose();
    lift = 0;
    clearClick();
    render();
  };
  const onDown = (event: PointerEvent) => {
    if (gesture || !event.isPrimary || event.button !== 0 || descent) return;
    event.preventDefault();
    lift = Math.min(hopLift, maxLift(viewportHeight()));
    clearClick();
    pet = { ...pet, velocity: 0, idleView: "profile", direction: Math.abs(face) < .15 ? pet.direction : face < 0 ? -1 : 1 };
    snack = interruptSnack(snack, performance.now(), viewportWidth());
    attention = cursor = null;
    mouse.setPointerCapture(event.pointerId);
    const time = performance.now();
    const start = { x: event.clientX, y: event.clientY };
    gesture = {
      pointerId: event.pointerId, started: time, movedAt: time, velocity: { x: 0, y: 0 },
      point: start, start, phase: "press", pickedUpAt: 0, gripOffset: { x: 0, y: 0 },
    };
    if (!motion.matches) render();
  };
  const onMove = (event: PointerEvent) => {
    const point = { x: event.clientX, y: event.clientY };
    if (gesture?.pointerId === event.pointerId) {
      trackPointer(gesture, point);
      if ((event.buttons & 1) === 0) {
        finishGesture(false);
        return;
      }
      if (motion.matches) return;
      const time = performance.now();
      if (gesture.phase === "press" && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= DRAG_START_PX) {
        gesture.gripOffset = {
          x: pet.x + screenGripX(pet.direction) - gesture.start.x,
          y: viewportHeight() - FLOOR_GAP - PET_HEIGHT + GRIP_Y - lift - gesture.start.y,
        };
        gesture.phase = "carry";
        gesture.pickedUpAt = time;
        showProfile();
      }
      if (gesture.phase === "carry") {
        placeAtGrip(time);
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
    const held = !motion.matches && performance.now() - gesture.started >= LONG_PRESS_MS;
    const carrying = gesture.phase === "carry";
    const speed = carrying ? cursorVelocity(gesture, performance.now()) : { x: 0, y: 0 };
    releaseCapture();
    if (!carrying && canClick && !held) {
      reactToClick();
    } else if (carrying || lift > 0) {
      sit();
      if (lift > 0 || speed.y < -160) {
        const headroom = Math.max(0, maxLift(viewportHeight()) - lift);
        const vy = Math.min(-speed.y, Math.sqrt(2 * FALL_GRAVITY * headroom));
        descent = { phase: "fall", started: performance.now(), x: pet.x, lift, vx: speed.x, vy };
      } else {
        lift = 0;
        resetCarryPose();
      }
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
    snack = resizeSnack(snack, performance.now(), viewportWidth());
    pet = fit(pet, viewportWidth());
    if (gesture?.phase === "carry") placeAtGrip(performance.now());
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
  showProfile();
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
