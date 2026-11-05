import { cardEntries, threadIdFromPath, type CardEntry } from "./card.ts";

const BUTTON_ATTR = "data-task-stop";
const SVG_NS = "http://www.w3.org/2000/svg";

const STYLE = `
[${BUTTON_ATTR}] {
  display: inline-grid; place-items: center; flex-shrink: 0; width: 20px; height: 20px; margin: 0 -4px 0 0;
  padding: 0; border: 0; border-radius: 5px; background: transparent; cursor: pointer;
  color: var(--muted-foreground); transition: background-color 120ms, color 120ms, opacity 120ms;
}
[${BUTTON_ATTR}]:hover { background: var(--state-hover, var(--accent)); color: var(--destructive); }
[${BUTTON_ATTR}]:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
[${BUTTON_ATTR}][data-busy] { cursor: default; opacity: 0.5; animation: task-stop-pulse 1s ease-in-out infinite; }
[${BUTTON_ATTR}][data-error] { color: var(--destructive); }
[${BUTTON_ATTR}] svg { width: 12px; height: 12px; }
@keyframes task-stop-pulse { 50% { opacity: 0.2; } }
@media (prefers-reduced-motion: reduce) { [${BUTTON_ATTR}][data-busy] { animation: none; } }
`;

interface Mounted {
  button: HTMLButtonElement;
  entry: CardEntry;
}

function stopIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("aria-hidden", "true");
  const square = document.createElementNS(SVG_NS, "rect");
  for (const [name, value] of Object.entries({ x: "1.5", y: "1.5", width: "9", height: "9", rx: "1.5", fill: "currentColor" })) {
    square.setAttribute(name, value);
  }
  svg.append(square);
  return svg;
}

/** Adds a stop button to every row of bb's background commands and agents card. */
export function mountStopButtons({ stopUrl }: { stopUrl: string }): () => void {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);
  const mounted = new Map<Element, Mounted>();
  let frame = 0;

  async function stop(state: Mounted) {
    const { button, entry } = state;
    const threadId = threadIdFromPath(location.pathname);
    if (threadId === null || button.hasAttribute("data-busy")) return;
    button.setAttribute("data-busy", "");
    button.removeAttribute("data-error");
    button.title = "Stopping…";
    try {
      const response = await fetch(stopUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, description: entry.description, index: entry.index }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; via?: string; error?: string } | null;
      if (!response.ok || result?.ok !== true) throw new Error(result?.error ?? `Stop failed (${response.status})`);
      button.title = result.via === "asked" ? "Asked the agent to stop it" : "Stopped";
    } catch (error) {
      button.removeAttribute("data-busy");
      button.setAttribute("data-error", "");
      button.title = error instanceof Error ? error.message : String(error);
    }
  }

  function paint() {
    frame = 0;
    const entries = threadIdFromPath(location.pathname) === null ? [] : cardEntries(document);
    const seen = new Set<Element>();
    for (const entry of entries) {
      seen.add(entry.host);
      let state = mounted.get(entry.host);
      if (state === undefined) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(BUTTON_ATTR, "");
        button.append(stopIcon());
        const created: Mounted = { button, entry };
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void stop(created);
        });
        state = created;
        mounted.set(entry.host, state);
      }
      if (state.entry.description !== entry.description || state.entry.index !== entry.index) {
        state.button.removeAttribute("data-busy");
        state.button.removeAttribute("data-error");
      }
      state.entry = entry;
      const label = `Stop ${entry.kind}: ${entry.description}`;
      if (state.button.getAttribute("aria-label") !== label) state.button.setAttribute("aria-label", label);
      if (!state.button.hasAttribute("data-busy") && !state.button.hasAttribute("data-error")) state.button.title = "Stop";
      if (entry.host.lastElementChild !== state.button) entry.host.append(state.button);
    }
    for (const [host, state] of mounted) {
      if (seen.has(host)) continue;
      state.button.remove();
      mounted.delete(host);
    }
  }

  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(paint);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["title", "aria-label"] });
  schedule();

  return () => {
    observer.disconnect();
    if (frame !== 0) cancelAnimationFrame(frame);
    for (const state of mounted.values()) state.button.remove();
    mounted.clear();
    style.remove();
  };
}
