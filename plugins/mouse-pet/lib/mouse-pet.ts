import { advance, createPet, fit, isGrooming, maxX, MAX_FRAME_MS, PET_WIDTH, startle, type Pet } from "./pet.ts";
import { advanceBurrow, burrowVisibility, findBurrow, nextBurrowAt, nextHopAt, recordClick, shouldHideFromClicks, type Burrow } from "./burrow.ts";
import { advancePerspective, createPerspective, perspectiveFrame } from "./perspective.ts";
import {
  carryPosition, DRAG_START_PX, FLOOR_GAP, GRIP_X, GRIP_Y, gripPoint, LONG_PRESS_MS,
  maxLift, PET_HEIGHT, screenGripX, screenGripY, scruffPath, sniffDistance, type Point,
} from "./interaction.ts";
import {
  anchorPaw, blendGaitStyle, FALL_GRAVITY, fallFrame, followSpring, gaitFrame, hopCompression, hopHeight, HOP_MS, HOP_TOUCHDOWN,
  nextMoveVariant, pounceHeight, sleepBreath, strideLength, turnFrame, type MoveVariant, type PawPlant, type Spring,
} from "./animation.ts";
import {
  advanceSnack, BITE_MS, biteMaskPath, cheeseLanding, CHEESE_VIEWBOX_WIDTH, CHEESE_WIDTH, createSnack, interruptSnack, resizeSnack,
} from "./snack.ts";
import { advanceMetabolism, bellyScale, createMetabolism, hunger, movementPace } from "./metabolism.ts";

const ROOT_ATTR = "data-mouse-pet";
const SQUEAK_MS = 700;
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

function pawPath(index: number, reach = 0, lift = 0, bodyRise = 0) {
  const { x, y, hock, toe } = PAWS[index];
  const footX = (x + reach).toFixed(2);
  const footY = (27.2 - lift).toFixed(2);
  const bend = (x + hock + reach * .42).toFixed(2);
  return `M${x} ${(y - bodyRise).toFixed(2)}Q${bend} ${(24.6 - lift * .42 - bodyRise * .45).toFixed(2)} ${footX} ${footY}q${toe * .5} .55 ${toe} .2`;
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
[${ROOT_ATTR}] .mp-mouse[data-burrow] { pointer-events: none; }
[${ROOT_ATTR}] [data-burrow] .mp-hop {
  transform-origin: center bottom;
  opacity: var(--mp-burrow-visibility);
  transform: scale(calc(.52 + .48 * var(--mp-burrow-visibility)));
}
[${ROOT_ATTR}] .mp-burrow {
  position: absolute; bottom: ${FLOOR_GAP}px; width: 24px; height: 20px;
  border-radius: 60% 60% 16% 16%; pointer-events: none;
  background: radial-gradient(ellipse at 50% 82%, #25222b 53%, #514956 65%, #817585 77%, transparent 79%);
}
[${ROOT_ATTR}] .mp-burrow[data-edge="-1"] { left: -5px; }
[${ROOT_ATTR}] .mp-burrow[data-edge="1"] { right: -5px; }
[${ROOT_ATTR}] .mp-belly {
  transform-box: fill-box; transform-origin: center bottom;
  transform: scale(var(--mp-belly-width, 1), var(--mp-belly-height, 1));
}
[${ROOT_ATTR}] .mp-flip { position: relative; isolation: isolate; }
[${ROOT_ATTR}] .mp-plane {
  width: 100%; height: 100%; transform-origin: center bottom;
  transform: translateY(var(--mp-depth-shift, 0px)) scale(var(--mp-depth-scale, 1));
}
[${ROOT_ATTR}] .mp-depth-left { transform: translateY(min(0px, var(--mp-depth-step, 0px))); }
[${ROOT_ATTR}] .mp-depth-right { transform: translateY(min(0px, calc(-1 * var(--mp-depth-step, 0px)))); }
[${ROOT_ATTR}] .mp-profile { transform: scaleX(var(--mp-turn, 1)); opacity: var(--mp-profile, 1); }
[${ROOT_ATTR}] :is(.mp-anfas, .mp-rear-view) {
  position: absolute; inset: 0; opacity: calc(1 - var(--mp-profile, 1)); mix-blend-mode: plus-lighter;
}
[${ROOT_ATTR}] .mp-rear-view, [${ROOT_ATTR}] [data-depth-view="back"] .mp-anfas { display: none; }
[${ROOT_ATTR}] [data-depth-view="back"] .mp-rear-view { display: block; }
[${ROOT_ATTR}] .mp-rear-tail {
  transform-box: view-box; transform-origin: 24.1px 24.1px; transform: rotate(var(--mp-rear-tail, 0deg));
}
[${ROOT_ATTR}] svg { overflow: visible; }
[${ROOT_ATTR}] .mp-cheese {
  position: absolute; left: 0; bottom: ${FLOOR_GAP}px; width: ${CHEESE_WIDTH}px; height: ${PET_HEIGHT}px;
  pointer-events: none;
}
[${ROOT_ATTR}] .mp-cheese[data-edge="1"] svg { transform: scaleX(-1); }

[${ROOT_ATTR}] .mp-tail, [${ROOT_ATTR}] .mp-eye,
[${ROOT_ATTR}] .mp-impact, [${ROOT_ATTR}] .mp-groom-paw { transform-box: view-box; }
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
[${ROOT_ATTR}] .mp-groom-paw { transform-origin: 35px 21px; }
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
[${ROOT_ATTR}] [data-mode="push"] .mp-head { transform: translate(1px, 2px) rotate(14deg); }
[${ROOT_ATTR}] [data-mode="eat"] .mp-head { animation: mp-nibble ${BITE_MS}ms ease-in-out infinite; }
[${ROOT_ATTR}] [data-mode="eat"] .mp-front { transform: rotate(-115deg); }
[${ROOT_ATTR}] :is([data-mode="groom"], [data-mode="scratch"]) .mp-pose {
  transform-origin: 19px 27px; transform: translateY(1px) rotate(-9deg);
}
[${ROOT_ATTR}] :is([data-mode="groom"], [data-mode="scratch"]) .mp-groom-paw { stroke: ${FUR_FAR}; }
[${ROOT_ATTR}] [data-mode="groom"] .mp-head { transform: translate(-.5px, .8px) rotate(7deg); }
[${ROOT_ATTR}] [data-mode="groom"] .mp-front { transform: rotate(-112deg); }
[${ROOT_ATTR}] [data-mode="groom"] .mp-groom-paw { animation: mp-face-wash .56s .13s ease-in-out infinite; }
[${ROOT_ATTR}] [data-mode="scratch"] .mp-head { transform: translate(-.9px, 1px) rotate(-8deg); }
[${ROOT_ATTR}] [data-mode="scratch"] .mp-front { transform: rotate(-164deg); }
[${ROOT_ATTR}] [data-mode="scratch"] .mp-groom-paw { animation: mp-ear-scratch .72s .13s ease-in-out infinite; }
[${ROOT_ATTR}] :is([data-mode="sleep"], [data-mode="stretch"], [data-mode="groom"], [data-mode="scratch"]) .mp-eye-state { opacity: 0; }
[${ROOT_ATTR}] :is([data-mode="sleep"], [data-mode="stretch"], [data-mode="groom"], [data-mode="scratch"]) .mp-eye-closed { opacity: 1; }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-pose {
  transform: translateY(2px) scale(1.03, .88); transition-duration: .36s;
}
[${ROOT_ATTR}] [data-mode="sleep"] .mp-head { transform: translate(-1px, 1px) rotate(10deg); }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-front { transform: rotate(-35deg); }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-leg-pose { transform: translateY(-2px) scaleY(.65); }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-tail-pose { transform: rotate(-25deg); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="1"] .mp-pose { transform: translate(-1px, 1.4px) scale(.91, .87); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="1"] .mp-head { transform: translate(-5px, 3px) rotate(24deg); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="1"] .mp-tail-pose { transform: rotate(-58deg); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="2"] .mp-pose { transform: translateY(2.5px) scale(1.12, .79); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="2"] .mp-head { transform: translate(1px, 2.5px) rotate(13deg); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="2"] .mp-front { transform: translateX(3px) rotate(-51deg); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="3"] .mp-pose { transform: translateY(1.2px) scale(.94, .94); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="3"] .mp-head { transform: translate(-2px, 1px) rotate(-7deg); }
[${ROOT_ATTR}] [data-mode="sleep"][data-variant="3"] .mp-tail-pose { transform: rotate(19deg); }
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
@keyframes mp-nibble {
  0%, 100% { transform: translateY(1px) rotate(6deg); }
  35% { transform: translate(1px, 1.7px) rotate(11deg); }
  60% { transform: translateY(.6px) rotate(4deg); }
}
@keyframes mp-face-wash {
  0%, 100% { transform: none; }
  58% { transform: rotate(-35deg) translateY(.7px); }
}
@keyframes mp-ear-scratch {
  0%, 22%, 44%, 100% { transform: none; }
  11%, 33%, 55% { transform: rotate(-23deg) translateY(.8px); }
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
      <g class="mp-tail-mount"><g class="mp-tail-pose">
        <path class="mp-tail" d="M12 19C5 20 2 14 6 9" fill="none" stroke="${PINK}" stroke-width="1.8" stroke-linecap="round"/>
      </g></g>
      <g class="mp-figure">
        <g class="mp-leg-pose" stroke-linecap="round" fill="none">
          <path class="mp-leg" d="${pawPath(0)}" stroke="${FUR_FAR}" stroke-width="2.05"/>
          <g class="mp-far-front"><path class="mp-leg" d="${pawPath(1)}" stroke="${FUR_FAR}" stroke-width="1.65"/></g>
          <path class="mp-leg" d="${pawPath(2)}" stroke="${FUR}" stroke-width="2.25"/>
        </g>
        <g class="mp-torso"><g class="mp-doze">
          <ellipse class="mp-belly" cx="23" cy="17" rx="14.5" ry="7.5" fill="${FUR}"/>
          <g class="mp-head">
            <ellipse cx="38" cy="16" rx="7.5" ry="5.4" fill="${FUR}"/>
            <circle cx="33.5" cy="9.6" r="4.3" fill="${FUR}"/>
            <circle cx="33.5" cy="9.6" r="2.6" fill="${PINK}"/>
            <circle cx="45" cy="17" r="1.6" fill="${PINK}"/>
            <path d="M42 18.4 47.5 17.2M42 19.2 47.5 20.6" fill="none" stroke="${FUR_FAR}" stroke-width=".6" stroke-linecap="round"/>
            <g class="mp-eye-state"><circle class="mp-eye" cx="38" cy="14.5" r="1.2" fill="${INK}"/></g>
            <path class="mp-eye-closed" d="M36.6 14.7q1.4 1.1 2.8 0" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>
          </g>
        </g></g>
        <g class="mp-front">
          <g class="mp-groom-paw" stroke="${FUR}">
            <path class="mp-leg" d="${pawPath(3)}" fill="none" stroke-width="1.9" stroke-linecap="round"/>
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
  <g stroke="${FUR_FAR}" stroke-width="2.6" stroke-linecap="round" fill="none">
    <path class="mp-depth-left" d="M19 24l-1 3.5h2"/>
    <path class="mp-depth-right" d="M29 24l1 3.5h-2"/>
  </g>
  <ellipse class="mp-belly" cx="24" cy="18.5" rx="9" ry="7.5" fill="${FUR}"/>
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
  <g stroke="${FUR_FAR}" stroke-width="2.8" stroke-linecap="round" fill="none">
    <path class="mp-depth-left" d="M19 25l-2 2.5h3"/>
    <path class="mp-depth-right" d="M29 25l2 2.5h-3"/>
  </g>
  <circle cx="18.3" cy="10.6" r="3.8" fill="${FUR_FAR}"/>
  <circle cx="29.7" cy="10.6" r="3.8" fill="${FUR_FAR}"/>
  <ellipse cx="24" cy="15.2" rx="7.5" ry="6.5" fill="${FUR}"/>
  <ellipse class="mp-belly" cx="24" cy="20.2" rx="10.3" ry="7" fill="${FUR}"/>
  <path class="mp-rear-tail" d="M24.1 24.1c-.4 4.1 9.7 5.5 12.6 1.2 1.3-2 0-3.4-.9-4.1" stroke="${PINK}" stroke-width="1.7" stroke-linecap="round" fill="none"/>
</svg>`;

const CHEESE = `
<div class="mp-cheese" hidden>
  <svg viewBox="0 0 ${CHEESE_VIEWBOX_WIDTH} 29" preserveAspectRatio="none" aria-hidden="true" focusable="false">
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
const footfallShift = (shift: number, step: number) => shift - Math.abs(step) * .85;

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
  root.innerHTML = `<div class="mp-burrow" hidden></div>${CHEESE}<div class="mp-mouse" data-mode="walk"><span class="mp-squeak">Pi!</span><span class="mp-z">z</span><div class="mp-hop"><div class="mp-plane"><div class="mp-flip" data-dir="1">${SPRITE}${FRONT_SPRITE}${BACK_SPRITE}</div></div></div></div>`;
  const mouse = root.querySelector<HTMLElement>(".mp-mouse")!;
  const hop = root.querySelector<HTMLElement>(".mp-hop")!;
  const flip = root.querySelector<HTMLElement>(".mp-flip")!;
  const impact = root.querySelector<SVGGElement>(".mp-impact")!;
  const bobbing = root.querySelectorAll<SVGGElement>(".mp-torso, .mp-tail-mount");
  const squeak = root.querySelector<HTMLElement>(".mp-squeak")!;
  const legs = Array.from(root.querySelectorAll<SVGElement>(".mp-leg"));
  const scruff = root.querySelector<SVGElement>(".mp-scruff")!;
  const cheese = root.querySelector<HTMLElement>(".mp-cheese")!;
  const entrance = root.querySelector<HTMLElement>(".mp-burrow")!;
  const biteMask = cheese.querySelector<SVGElement>(".mp-cheese-bites")!;
  document.head.append(style);
  document.body.append(root);

  let pet: Pet = createPet(viewportWidth(), Math.random);
  let snack = createSnack(performance.now());
  let metabolism = createMetabolism();
  let perspective = createPerspective(performance.now());
  let burrow: Burrow | null = null;
  let recentClicks: number[] = [];
  let hideAt = nextBurrowAt(performance.now(), Math.random);
  let jumpAt = nextHopAt(performance.now(), Math.random);
  const variants: Record<"walk" | "run" | "sleep", MoveVariant> = { walk: 0, run: 0, sleep: 0 };
  let variant: MoveVariant = 0;
  let animatedMode: Pet["mode"] | null = null;
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
  let hopStrength = 1;
  let stride = 0;
  let gaitSpeed = 0;
  let gaitStyle = { lift: 1, bob: 1, tail: 1 };
  let plants: PawPlant[] = [];
  let face: number = pet.direction;
  let turn = { from: face, to: face, progress: 1 };
  let rest = 0;
  let tailPhase = 0;
  const motion = prefersReducedMotion();

  const render = () => {
    mouse.style.transform = `translate3d(${pet.x.toFixed(2)}px, ${(-(lift + hopLift)).toFixed(2)}px, 0)`;
    const belly = bellyScale(metabolism.belly);
    mouse.style.setProperty("--mp-belly-width", belly.width.toFixed(3));
    mouse.style.setProperty("--mp-belly-height", belly.height.toFixed(3));
    const { scale, shift, step } = perspectiveFrame(perspective);
    mouse.style.setProperty("--mp-depth-scale", scale.toFixed(3));
    mouse.style.setProperty("--mp-depth-shift", `${footfallShift(shift, step).toFixed(2)}px`);
    mouse.style.setProperty("--mp-depth-step", `${(step * 2.4).toFixed(2)}px`);
    mouse.dataset.plane = perspective.depth === 0 ? "far" : perspective.depth === 1 ? "near" : "crossing";
    mouse.hidden = burrow?.phase === "hide";
    entrance.hidden = !burrow;
    if (burrow) {
      mouse.dataset.burrow = burrow.phase;
      entrance.dataset.edge = String(burrow.edge);
      mouse.style.setProperty("--mp-burrow-visibility", String(burrowVisibility(burrow)));
    } else {
      delete mouse.dataset.burrow;
    }
    const snackPose = snack.action?.kind === "seek" ? undefined : snack.action?.kind;
    const groundedPose = gaitSpeed > 9 && pet.mode !== "skid"
      ? gaitSpeed > 55 * movementPace(metabolism.belly) ? "run" : "walk"
      : pet.mode;
    const mode = motion.matches ? "sit" : gesture?.phase ?? descent?.phase ?? attention?.phase ?? snackPose ?? groundedPose;
    if (mouse.dataset.mode !== mode) mouse.dataset.mode = mode;
    if (mouse.dataset.variant !== String(variant)) mouse.dataset.variant = String(variant);
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
    let pounceLanded = false;
    let compression = 0;
    hopLift = 0;
    if (hopStarted !== null) {
      const progress = (time - hopStarted) / HOP_MS;
      hopInFlight = progress < HOP_TOUCHDOWN;
      hopLift = Math.min(maxLift(viewportHeight()), hopHeight(progress, hopStartHeight, hopStrength));
      compression = hopCompression(progress, hopStrength);
      if (progress >= 1) {
        hopStarted = null;
        hop.removeAttribute("data-hop");
      }
    }
    if (snack.action?.kind === "pounce" && snack.cheese) {
      const age = time - snack.action.started;
      pounceLanded = age >= HOP_MS * HOP_TOUCHDOWN;
      const perchLift = Math.min(maxLift(viewportHeight()), cheeseLanding(snack.cheese).lift);
      hopLift = Math.max(hopLift, pounceHeight(age, snack.action.duration, perchLift));
      hopInFlight = true;
    }
    const depthView = !gesture && !attention && !descent && !snack.action && pet.mode === "sit" &&
      Math.abs(pet.velocity) < 9 && pet.idleView !== "profile";
    const facing = depthView ? 0 : Math.abs(pet.velocity) < 9 ? pet.direction : Math.sign(pet.velocity);
    if (depthView) flip.dataset.depthView = pet.idleView;
    if (turn.to !== facing) turn = { from: face, to: facing, progress: 0 };
    turn.progress = Math.min(1, turn.progress + dt / 185);
    const view = turnFrame(turn.from, turn.to, turn.progress);
    const reversed = (face < 0) !== (view.yaw < 0);
    face = view.yaw;
    perspective = advancePerspective(perspective, depthView && Math.abs(face) < .18 ? pet.idleView : "profile", time, dt, Math.random);
    const movingOnFloor = !gesture && !descent && !hopInFlight && pet.mode !== "skid" && snack.action?.kind !== "eat" &&
      (!attention || attention.phase === "approach");
    const speed = movingOnFloor && dt > 0 ? Math.abs(distance) * 1_000 / dt : 0;
    gaitSpeed += (speed - gaitSpeed) * (1 - Math.exp(-dt / 44));
    const pace = movementPace(metabolism.belly);
    const equivalentSpeed = gaitSpeed / pace;
    const projection = perspectiveFrame(perspective).scale * view.width;
    const direction = face < 0 ? -1 : 1;
    const stepLength = strideLength(equivalentSpeed, pace, projection);
    if (movingOnFloor) {
      stride += distance * direction / stepLength;
      stride -= Math.floor(stride);
    }
    gaitStyle = blendGaitStyle(gaitStyle, variant, dt);
    const gait = gaitFrame(stride, equivalentSpeed, pace, gaitStyle);
    const torsoMotion = `translateY(${(-gait.bob).toFixed(2)}px)`;
    bobbing.forEach((part) => { if (part.style.transform !== torsoMotion) part.style.transform = torsoMotion; });
    impact.style.transform = compression ? `scale(${1 + compression * .42}, ${1 - compression})` : "";
    const dozing = !gesture && pet.mode === "sleep" && gaitSpeed <= 9;
    rest += ((dozing ? 1 : 0) - rest) * (1 - Math.exp(-dt / 140));
    tailPhase = (tailPhase + dt / (240 + rest * 430)) % (Math.PI * 2);
    const tail = gait.tail + Math.sin(tailPhase) * (1.8 - rest * .9);
    const breath = sleepBreath(time, rest, variants.sleep);
    mouse.style.setProperty("--mp-tail", `${tail.toFixed(2)}deg`);
    mouse.style.setProperty("--mp-breath", breath.toFixed(3));
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
    const airborne = pounceLanded ? 0 : Math.min(hopLift / 16, 1);
    const supportsWeight = movingOnFloor && !reversed && view.profile >= .9 &&
      (gaitSpeed > 9 || pet.mode === "walk" || pet.mode === "run");
    legs.forEach((leg, index) => {
      const foot = gait.feet[index];
      const front = index % 2 === 1;
      const reach = foot.reach + airborne * (front ? 1.2 : -.8);
      const raise = foot.lift + airborne * (front ? .8 : 2);
      const localX = PAWS[index].x + PAWS[index].toe - PET_WIDTH / 2 + reach;
      plants[index] = anchorPaw(plants[index], localX, pet.x + PET_WIDTH / 2, direction * projection,
        supportsWeight && raise === 0, dt);
      const shape = pawPath(index, reach + plants[index].correction, raise, gait.bob);
      if (leg.getAttribute("d") !== shape) leg.setAttribute("d", shape);
    });
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
    const { scale, shift, step } = perspectiveFrame(perspective);
    const position = carryPosition(point, pet.direction, viewportWidth(), viewportHeight(), scale, footfallShift(shift, step));
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
    if (gesture.phase === "press" && hopStarted !== null) {
      pet = advance(pet, dt, viewportWidth(), Math.random, movementPace(metabolism.belly));
    }
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
    hideAt = nextBurrowAt(time, Math.random);
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

  const beginBurrow = (time: number) => {
    cancelInteraction();
    burrow = findBurrow(pet, viewportWidth(), Math.random);
    recentClicks = [];
    hideAt = nextBurrowAt(time, Math.random);
    jumpAt = nextHopAt(time, Math.random);
  };

  const tick = (time: number) => {
    const elapsed = lastTime === 0 ? 0 : Math.max(0, time - lastTime);
    const dt = Math.min(elapsed, MAX_FRAME_MS);
    lastTime = time;
    updatePet(time, dt, elapsed);
    render();
    frame = requestAnimationFrame(tick);
  };

  const updatePet = (time: number, dt: number, elapsed: number) => {
    const x = pet.x;
    const pace = movementPace(metabolism.belly);
    const remainingMs = pet.remainingMs;
    let bites = 0;
    let distance = 0;
    let activeMs = 0;
    const strolling = pet.mode === "walk" || pet.mode === "sit";
    if (!burrow && !gesture && !descent && !snack.action && !attention && hopStarted === null && strolling && time >= hideAt) {
      beginBurrow(time);
    }
    if (burrow) {
      const hiding = advanceBurrow(burrow, pet, dt, viewportWidth(), pace);
      burrow = hiding.burrow;
      pet = hiding.pet;
      distance = Math.min(Math.abs(pet.x - x), dt * .15);
      if (!burrow) {
        hideAt = nextBurrowAt(time, Math.random);
        jumpAt = nextHopAt(time, Math.random);
      }
    } else if (gesture) updateGesture(time, dt);
    else if (descent) updateDescent(time, dt);
    else if (snack.action || !updateAttention(time)) {
      const hadSnackAction = Boolean(snack.action);
      if (hopStarted === null || snack.action?.kind === "pounce") {
        const wasPouncing = snack.action?.kind === "pounce";
        const next = advanceSnack(snack, pet, time, viewportWidth(), Math.random, hunger(metabolism), pace);
        snack = next.snack;
        pet = next.pet;
        bites = next.bitesTaken ?? 0;
        if (!wasPouncing && snack.action?.kind === "pounce") startHop(time, 1);
      }
      if (!hadSnackAction && !snack.action) {
        if (hopStarted === null && (pet.mode === "walk" || pet.mode === "run") &&
            pet.remainingMs > HOP_MS && time >= jumpAt) {
          startHop(time, .58);
          jumpAt = nextHopAt(time, Math.random);
        }
        pet = advance(pet, dt, viewportWidth(), Math.random, pace);
      }
      if (bites === 0 && snack.action?.kind !== "eat") distance = Math.min(Math.abs(pet.x - x), dt * .15);
      if (isGrooming(pet.mode) || pet.mode === "stretch") activeMs = dt;
    }
    if ((pet.mode === "walk" || pet.mode === "run" || pet.mode === "sleep") &&
        (animatedMode !== pet.mode || (!snack.action && !burrow && pet.remainingMs > remainingMs))) {
      variant = variants[pet.mode] = nextMoveVariant(variants[pet.mode], Math.random());
    }
    animatedMode = pet.mode;
    metabolism = advanceMetabolism(metabolism, elapsed, distance, activeMs, bites);
    drawMotion(time, dt, pet.x - x);
  };
  const stopLoop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  };
  const syncMotion = () => {
    cancelInteraction();
    stopLoop();
    const time = performance.now();
    hideAt = nextBurrowAt(time, Math.random);
    jumpAt = nextHopAt(time, Math.random);
    recentClicks = [];
    if (motion.matches) {
      burrow = null;
      perspective = createPerspective(time);
      pet = { ...pet, x: Math.max(0, Math.min(pet.x, maxX(viewportWidth()))) };
      sit();
      gaitSpeed = 0;
      plants = [];
      showProfile();
      bobbing.forEach((part) => part.style.removeProperty("transform"));
      mouse.style.removeProperty("--mp-tail");
      mouse.style.removeProperty("--mp-breath");
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
    impact.style.removeProperty("transform");
    hop.removeAttribute("data-hop");
    squeak.removeAttribute("data-visible");
  };
  const startHop = (time: number, strength: number) => {
    hop.setAttribute("data-hop", "");
    hopStartHeight = hopLift = Math.min(maxLift(viewportHeight()), lift);
    hopStrength = strength;
    lift = 0;
    hopStarted = time;
  };
  const squeakOnClick = () => {
    squeak.setAttribute("data-visible", "");
    clickTimer = window.setTimeout(() => squeak.removeAttribute("data-visible"), SQUEAK_MS);
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
    if (burrow || gesture || !event.isPrimary || event.button !== 0 || descent) return;
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
    if (!motion.matches) {
      startHop(time, .85);
      pet = startle(pet, movementPace(metabolism.belly));
    }
    render();
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
        lift = hopLift;
        clearClick();
        pet.velocity = 0;
        const { scale, shift, step } = perspectiveFrame(perspective);
        gesture.gripOffset = {
          x: pet.x + screenGripX(pet.direction, scale) - gesture.start.x,
          y: screenGripY(viewportHeight(), scale, footfallShift(shift, step)) - lift - gesture.start.y,
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
    if (motion.matches || burrow || gesture || event.pointerType !== "mouse") return;
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
    const time = performance.now();
    const held = !motion.matches && time - gesture.started >= LONG_PRESS_MS;
    const carrying = gesture.phase === "carry";
    const speed = carrying ? cursorVelocity(gesture, performance.now()) : { x: 0, y: 0 };
    releaseCapture();
    if (!carrying && canClick && !held) {
      hideAt = nextBurrowAt(time, Math.random);
      if (!motion.matches) recentClicks = recordClick(recentClicks, time);
      if (shouldHideFromClicks(recentClicks)) beginBurrow(time);
      else squeakOnClick();
    } else if (carrying || lift > 0) {
      hideAt = nextBurrowAt(time, Math.random);
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
  const onVisibility = () => {
    if (document.hidden) cancelInteraction();
    lastTime = 0;
  };
  const onResize = () => {
    clearAttention();
    plants = [];
    snack = resizeSnack(snack, performance.now(), viewportWidth());
    if (!burrow || burrow.phase === "run") pet = fit(pet, viewportWidth());
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
