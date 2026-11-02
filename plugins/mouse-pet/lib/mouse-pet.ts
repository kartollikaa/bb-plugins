import { advance, createPet, fit, PET_WIDTH, startle, type Pet } from "./pet.ts";

const ROOT_ATTR = "data-mouse-pet";
const SQUEAK_MS = 700;
const HOP_MS = 420;

const STYLE = `
[${ROOT_ATTR}] {
  position: fixed; left: 0; right: 0; bottom: 0; height: 40px; z-index: 40;
  pointer-events: none; overflow: visible;
}
[${ROOT_ATTR}] .mp-mouse {
  position: absolute; left: 0; bottom: 2px; width: ${PET_WIDTH}px; height: 29px;
  pointer-events: auto; cursor: pointer; will-change: transform; user-select: none;
  -webkit-tap-highlight-color: transparent;
}
[${ROOT_ATTR}] .mp-hop, [${ROOT_ATTR}] .mp-flip, [${ROOT_ATTR}] svg { display: block; width: 100%; height: 100%; }
[${ROOT_ATTR}] .mp-flip[data-dir="-1"] { transform: scaleX(-1); }
[${ROOT_ATTR}] .mp-hop[data-hop] { animation: mp-hop ${HOP_MS}ms cubic-bezier(.3, .7, .4, 1); }
[${ROOT_ATTR}] svg { overflow: visible; }

[${ROOT_ATTR}] .mp-leg, [${ROOT_ATTR}] .mp-tail, [${ROOT_ATTR}] .mp-eye, [${ROOT_ATTR}] .mp-figure { transform-box: view-box; }
[${ROOT_ATTR}] .mp-leg { animation: mp-swing var(--mp-step, .2s) ease-in-out infinite alternate; animation-play-state: paused; }
[${ROOT_ATTR}] .mp-leg[data-phase="b"] { animation-direction: alternate-reverse; }
[${ROOT_ATTR}] .mp-tail { transform-origin: 12px 18px; animation: mp-tail 1.6s ease-in-out infinite alternate; }
[${ROOT_ATTR}] .mp-eye { transform-origin: 38px 14.5px; animation: mp-blink 4.5s infinite; }
[${ROOT_ATTR}] .mp-eye-closed, [${ROOT_ATTR}] .mp-z { display: none; }
[${ROOT_ATTR}] .mp-figure { transform-origin: 24px 29px; }

[${ROOT_ATTR}] [data-mode="walk"] { --mp-step: .24s; }
[${ROOT_ATTR}] [data-mode="run"] { --mp-step: .09s; }
[${ROOT_ATTR}] [data-mode="walk"] .mp-leg, [${ROOT_ATTR}] [data-mode="run"] .mp-leg { animation-play-state: running; }
[${ROOT_ATTR}] [data-mode="run"] .mp-figure { animation: mp-bob .18s ease-in-out infinite alternate; }
[${ROOT_ATTR}] [data-mode="run"] .mp-tail { animation-duration: .25s; }
[${ROOT_ATTR}] [data-mode="walk"] .mp-tail { animation-duration: .8s; }

[${ROOT_ATTR}] [data-mode="groom"] .mp-paw { animation: mp-wash .3s ease-in-out infinite alternate; animation-play-state: running; }
[${ROOT_ATTR}] [data-mode="groom"] .mp-tail, [${ROOT_ATTR}] [data-mode="sit"] .mp-tail { animation-duration: 2.4s; }

[${ROOT_ATTR}] [data-mode="sleep"] .mp-legs, [${ROOT_ATTR}] [data-mode="sleep"] .mp-eye { display: none; }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-eye-closed { display: inline; }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-figure { transform: translateY(3px) scaleY(.88); }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-tail { animation-duration: 3.6s; }
[${ROOT_ATTR}] [data-mode="sleep"] .mp-z {
  display: block; position: absolute; left: 100%; bottom: 60%; margin-left: -4px;
  font: 600 11px/1 ui-monospace, monospace; color: var(--muted-foreground); animation: mp-z 2.4s ease-out infinite;
}

[${ROOT_ATTR}] .mp-squeak {
  display: none; position: absolute; left: 50%; bottom: 100%; margin-bottom: 4px; padding: 2px 7px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--popover); color: var(--popover-foreground);
  font: 600 11px/1.3 system-ui, sans-serif; white-space: nowrap; transform: translateX(-50%);
  box-shadow: 0 2px 8px rgb(0 0 0 / .2);
}
[${ROOT_ATTR}] .mp-squeak[data-visible] { display: block; animation: mp-pop ${SQUEAK_MS}ms ease-out; }

@keyframes mp-swing { from { transform: rotate(-38deg); } to { transform: rotate(38deg); } }
@keyframes mp-wash { from { transform: rotate(-125deg); } to { transform: rotate(-158deg); } }
@keyframes mp-tail { from { transform: rotate(-9deg); } to { transform: rotate(11deg); } }
@keyframes mp-bob { from { transform: translateY(0); } to { transform: translateY(-1.5px); } }
@keyframes mp-blink { 0%, 94%, 100% { transform: scaleY(1); } 97% { transform: scaleY(.1); } }
@keyframes mp-hop { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-16px); } }
@keyframes mp-z { from { opacity: 0; transform: translate(0, 4px); } 25% { opacity: 1; } to { opacity: 0; transform: translate(5px, -9px); } }
@keyframes mp-pop { from { opacity: 0; transform: translate(-50%, 4px); } 15% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } to { opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  [${ROOT_ATTR}] * { animation: none !important; }
}
`;

const FUR = "#c9c9d6";
const FUR_FAR = "#a3a3b3";
const PINK = "#f3a2b6";
const INK = "#2b2b36";

const SPRITE = `
<svg viewBox="0 0 48 29" aria-hidden="true" focusable="false">
  <g class="mp-tail"><path d="M12 19C5 20 2 14 6 9" fill="none" stroke="${PINK}" stroke-width="1.8" stroke-linecap="round"/></g>
  <g class="mp-figure">
    <g class="mp-legs" stroke-linecap="round" stroke-width="2.6">
      <path class="mp-leg" data-phase="a" d="M16 21v6.5" stroke="${FUR_FAR}" style="transform-origin:16px 21px"/>
      <path class="mp-leg" data-phase="b" d="M31 21v6.5" stroke="${FUR_FAR}" style="transform-origin:31px 21px"/>
      <path class="mp-leg" data-phase="b" d="M20 21v6.5" stroke="${FUR}" style="transform-origin:20px 21px"/>
      <path class="mp-leg mp-paw" data-phase="a" d="M35 21v6.5" stroke="${FUR}" style="transform-origin:35px 21px"/>
    </g>
    <ellipse cx="23" cy="17" rx="14.5" ry="7.5" fill="${FUR}"/>
    <ellipse cx="38" cy="16" rx="7.5" ry="5.4" fill="${FUR}"/>
    <circle cx="33.5" cy="9.6" r="4.3" fill="${FUR}"/>
    <circle cx="33.5" cy="9.6" r="2.6" fill="${PINK}"/>
    <circle cx="45" cy="17" r="1.6" fill="${PINK}"/>
    <g stroke="${FUR_FAR}" stroke-width=".6" stroke-linecap="round">
      <path d="M42 18.4 47.5 17.2M42 19.2 47.5 20.6"/>
    </g>
    <circle class="mp-eye" cx="38" cy="14.5" r="1.2" fill="${INK}"/>
    <path class="mp-eye-closed" d="M36.6 14.7q1.4 1.1 2.8 0" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>
  </g>
</svg>`;

function prefersReducedMotion(): MediaQueryList {
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

const viewportWidth = () => document.documentElement.clientWidth;

export function mountMousePet({ signal }: { signal: AbortSignal }): () => void {
  const style = document.createElement("style");
  style.textContent = STYLE;
  const root = document.createElement("div");
  root.setAttribute(ROOT_ATTR, "");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<div class="mp-mouse" data-mode="walk"><span class="mp-squeak">Pi!</span><span class="mp-z">z</span><div class="mp-hop"><div class="mp-flip" data-dir="1">${SPRITE}</div></div></div>`;
  const mouse = root.querySelector<HTMLElement>(".mp-mouse")!;
  const hop = root.querySelector<HTMLElement>(".mp-hop")!;
  const flip = root.querySelector<HTMLElement>(".mp-flip")!;
  const squeak = root.querySelector<HTMLElement>(".mp-squeak")!;
  document.head.append(style);
  document.body.append(root);

  let pet: Pet = createPet(viewportWidth(), Math.random);
  let frame = 0;
  let lastTime = 0;
  const timers = new Set<number>();

  const render = () => {
    mouse.style.transform = `translate3d(${pet.x.toFixed(1)}px, 0, 0)`;
    if (mouse.dataset.mode !== pet.mode) mouse.dataset.mode = pet.mode;
    const direction = String(pet.direction);
    if (flip.dataset.dir !== direction) flip.dataset.dir = direction;
  };
  const tick = (time: number) => {
    pet = advance(pet, lastTime === 0 ? 0 : time - lastTime, viewportWidth(), Math.random);
    lastTime = time;
    render();
    frame = requestAnimationFrame(tick);
  };
  const stopLoop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  };
  const motion = prefersReducedMotion();
  const syncMotion = () => {
    stopLoop();
    if (motion.matches) {
      pet = { ...pet, mode: "sit" };
      render();
    } else {
      frame = requestAnimationFrame(tick);
    }
  };

  const flash = (element: HTMLElement, attribute: string, ms: number) => {
    element.removeAttribute(attribute);
    void element.offsetWidth;
    element.setAttribute(attribute, "");
    const timer = window.setTimeout(() => {
      element.removeAttribute(attribute);
      timers.delete(timer);
    }, ms);
    timers.add(timer);
  };
  const onClick = () => {
    flash(hop, "data-hop", HOP_MS);
    flash(squeak, "data-visible", SQUEAK_MS);
    if (!motion.matches) pet = startle(pet);
    render();
  };
  const onResize = () => {
    pet = fit(pet, viewportWidth());
    render();
  };

  mouse.addEventListener("click", onClick);
  window.addEventListener("resize", onResize);
  motion.addEventListener("change", syncMotion);
  render();
  syncMotion();

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopLoop();
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    mouse.removeEventListener("click", onClick);
    window.removeEventListener("resize", onResize);
    motion.removeEventListener("change", syncMotion);
    root.remove();
    style.remove();
  };
  signal.addEventListener("abort", dispose, { once: true });
  return dispose;
}
