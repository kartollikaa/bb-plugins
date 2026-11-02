import { describeBattery, footerText, isLow, type BatteryReading } from "./battery.ts";

const REFRESH_MS = 60_000;
const FOOTER_ROW = '[data-sidebar="footer"] > ul[data-sidebar="menu"]';
const ITEM_ATTR = "data-battery-footer";
const SVG_NS = "http://www.w3.org/2000/svg";

const STYLE = `
[${ITEM_ATTR}] { flex-shrink: 0; list-style: none; }
[${ITEM_ATTR}] button {
  display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 8px;
  border: 0; border-radius: 6px; background: transparent; cursor: pointer;
  color: var(--muted-foreground); font: inherit; font-size: 12px; line-height: 1;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
[${ITEM_ATTR}] button:hover { background: var(--sidebar-accent); color: var(--sidebar-foreground); }
[${ITEM_ATTR}] button:focus-visible { outline: 2px solid var(--sidebar-ring); outline-offset: -2px; }
[${ITEM_ATTR}][data-low] button { color: var(--destructive); }
[${ITEM_ATTR}] svg { width: 16px; height: 16px; flex-shrink: 0; }
`;

function batteryGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  const body = document.createElementNS(SVG_NS, "rect");
  for (const [name, value] of Object.entries({ x: "2.5", y: "7", width: "16", height: "10", rx: "2.5" })) {
    body.setAttribute(name, value);
  }
  const tip = document.createElementNS(SVG_NS, "path");
  tip.setAttribute("d", "M21.5 10.5v3");
  const level = document.createElementNS(SVG_NS, "rect");
  for (const [name, value] of Object.entries({ x: "5", y: "9.5", height: "5", rx: "1", fill: "currentColor", stroke: "none" })) {
    level.setAttribute(name, value);
  }
  svg.append(body, tip, level);
  return svg;
}

function buildItem(onClick: () => void) {
  const item = document.createElement("li");
  item.setAttribute(ITEM_ATTR, "");
  const button = document.createElement("button");
  button.type = "button";
  const glyph = batteryGlyph();
  const label = document.createElement("span");
  button.append(glyph, label);
  button.addEventListener("click", onClick);
  item.append(button);
  return { item, button, level: glyph.lastElementChild as SVGRectElement, label };
}

/** Adds a battery button to the right end of the sidebar footer row and keeps it current. */
export function mountFooterPercent({ statusUrl, signal }: { statusUrl: string; signal: AbortSignal }): () => void {
  let reading: BatteryReading | null | undefined;
  let frame = 0;
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const refresh = async () => {
    try {
      const response = await fetch(statusUrl, { signal, credentials: "same-origin" });
      if (!response.ok) return;
      reading = ((await response.json()) as { reading: BatteryReading | null }).reading;
      schedule();
    } catch {
      // A failed poll keeps the last reading on screen.
    }
  };
  const view = buildItem(() => void refresh());

  const paint = () => {
    frame = 0;
    const row = document.querySelector(FOOTER_ROW);
    if (row === null) return;
    if (view.item.parentElement !== row || row.lastElementChild !== view.item) row.append(view.item);
    const text = reading === undefined ? "…" : footerText(reading);
    if (view.label.textContent !== text) view.label.textContent = text;
    const description = reading === undefined ? "Reading battery…" : describeBattery(reading);
    view.button.title = description;
    view.button.setAttribute("aria-label", `Battery: ${description}`);
    view.item.toggleAttribute("data-low", isLow(reading ?? null));
    view.level.setAttribute("width", String(Math.max(1, Math.round(((reading?.percent ?? 0) / 100) * 11))));
  };
  function schedule() {
    if (frame === 0) frame = requestAnimationFrame(paint);
  }

  const observer = new MutationObserver(() => {
    const row = view.item.parentElement;
    if (row === null || !row.isConnected || row.lastElementChild !== view.item) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const onVisible = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  document.addEventListener("visibilitychange", onVisible);
  const timer = setInterval(() => void refresh(), REFRESH_MS);
  schedule();
  void refresh();

  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(timer);
    if (frame !== 0) cancelAnimationFrame(frame);
    view.item.remove();
    style.remove();
  };
}
