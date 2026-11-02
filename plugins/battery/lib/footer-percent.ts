import {
  chargeLevel,
  deviceSummary,
  footerText,
  isLow,
  isRemoteClient,
  laptopSummary,
  type BatteryReading,
  type BatterySummary,
  type DeviceBattery,
} from "./battery.ts";

const REFRESH_MS = 60_000;
const FOOTER_ROW = '[data-sidebar="footer"] > ul[data-sidebar="menu"]';
const ITEM_ATTR = "data-battery-footer";
const POPUP_ATTR = "data-battery-popup";
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
[data-level="low"] { --battery-fill: var(--destructive); }
[data-level="medium"] { --battery-fill: #eab308; }
[data-level="high"] { --battery-fill: #22c55e; }
[data-battery-level] { fill: var(--battery-fill, currentColor); }
[${POPUP_ATTR}] {
  position: fixed; z-index: 50; width: 240px; max-width: calc(100vw - 16px); padding: 6px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--popover); color: var(--popover-foreground);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.3); font-size: 13px; line-height: 1.3;
}
[${POPUP_ATTR}] [data-row] {
  display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 10px; padding: 8px;
}
[${POPUP_ATTR}] [data-row] + [data-row] { border-top: 1px solid var(--border); }
[${POPUP_ATTR}] [data-device] {
  display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px;
  background: var(--muted); color: var(--muted-foreground);
}
[${POPUP_ATTR}] [data-device] svg { width: 18px; height: 18px; }
[${POPUP_ATTR}] [data-name] { font-weight: 500; }
[${POPUP_ATTR}] [data-state] { font-size: 12px; color: var(--muted-foreground); }
[${POPUP_ATTR}] [data-charge] { display: flex; align-items: center; gap: 6px; }
[${POPUP_ATTR}] [data-charge] svg { width: 24px; height: 24px; color: var(--muted-foreground); }
[${POPUP_ATTR}] [data-percent] {
  min-width: 3.2em; text-align: right; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: var(--battery-fill);
}
`;

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function outlineIcon(...children: SVGElement[]): SVGSVGElement {
  const svg = svgElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  });
  svg.append(...children);
  return svg;
}

const LEVEL_MAX_WIDTH = 11;

/** A battery outline whose inner bar is sized by `setBatteryLevel`. */
function batteryGlyph(): { svg: SVGSVGElement; level: SVGRectElement; bolt: SVGPathElement } {
  const level = svgElement("rect", { x: "5", y: "9.5", height: "5", rx: "1", stroke: "none", "data-battery-level": "" });
  const bolt = svgElement("path", {
    d: "M11.5 8.5 9 12.5h3l-1.5 3",
    stroke: "var(--background, #000)",
    "stroke-width": "1.75",
    visibility: "hidden",
  });
  const svg = outlineIcon(
    svgElement("rect", { x: "2.5", y: "7", width: "16", height: "10", rx: "2.5" }),
    svgElement("path", { d: "M21.5 10.5v3" }),
    level,
    bolt,
  );
  return { svg, level, bolt };
}

function setBatteryLevel(level: SVGRectElement, percent: number) {
  level.setAttribute("width", String(Math.max(1, Math.round((percent / 100) * LEVEL_MAX_WIDTH))));
}

const laptopIcon = () =>
  outlineIcon(
    svgElement("rect", { x: "4", y: "5", width: "16", height: "11", rx: "1.5" }),
    svgElement("path", { d: "M2 19h20" }),
  );

const phoneIcon = () =>
  outlineIcon(
    svgElement("rect", { x: "6.5", y: "2.5", width: "11", height: "19", rx: "2.5" }),
    svgElement("path", { d: "M11 18.5h2" }),
  );

interface BatteryManagerLike extends DeviceBattery, EventTarget {}

async function deviceBattery(): Promise<BatteryManagerLike | null> {
  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }).getBattery;
  if (typeof getBattery !== "function" || !isRemoteClient(location.hostname)) return null;
  try {
    return await getBattery.call(navigator);
  } catch {
    return null;
  }
}

function popupRow(name: string, icon: SVGSVGElement, summary: BatterySummary | null): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("data-row", "");
  const device = document.createElement("div");
  device.setAttribute("data-device", "");
  device.append(icon);
  const text = document.createElement("div");
  const title = document.createElement("div");
  title.setAttribute("data-name", "");
  title.textContent = name;
  const state = document.createElement("div");
  state.setAttribute("data-state", "");
  state.textContent = summary?.state ?? "No battery";
  text.append(title, state);
  row.append(device, text);
  if (summary !== null) {
    const charge = document.createElement("div");
    charge.setAttribute("data-charge", "");
    charge.setAttribute("data-level", chargeLevel(summary.percent));
    const glyph = batteryGlyph();
    setBatteryLevel(glyph.level, summary.percent);
    glyph.bolt.setAttribute("visibility", summary.charging ? "visible" : "hidden");
    const percent = document.createElement("span");
    percent.setAttribute("data-percent", "");
    percent.textContent = `${summary.percent}%`;
    charge.append(glyph.svg, percent);
    row.append(charge);
  }
  return row;
}

function buildItem(onClick: () => void) {
  const item = document.createElement("li");
  item.setAttribute(ITEM_ATTR, "");
  const button = document.createElement("button");
  button.type = "button";
  const glyph = batteryGlyph();
  const label = document.createElement("span");
  button.append(glyph.svg, label);
  button.addEventListener("click", onClick);
  item.append(button);
  return { item, button, level: glyph.level, bolt: glyph.bolt, label };
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
  const popup = document.createElement("div");
  popup.setAttribute(POPUP_ATTR, "");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Battery");
  let device: BatteryManagerLike | null = null;
  const devicePromise = deviceBattery().then((battery) => {
    device = battery;
    battery?.addEventListener("levelchange", renderPopup);
    battery?.addEventListener("chargingchange", renderPopup);
  });

  function renderPopup() {
    if (!popup.isConnected) return;
    const rows = [popupRow("Laptop", laptopIcon(), reading == null ? null : laptopSummary(reading))];
    if (device !== null) {
      const touch = window.matchMedia("(pointer: coarse)").matches;
      rows.push(popupRow(touch ? "Phone" : "This device", touch ? phoneIcon() : laptopIcon(), deviceSummary(device)));
    }
    popup.replaceChildren(...rows);
    const anchor = view.button.getBoundingClientRect();
    popup.style.bottom = `${window.innerHeight - anchor.top + 6}px`;
    popup.style.left = `${Math.max(8, anchor.right - popup.offsetWidth)}px`;
  }
  const closePopup = () => {
    popup.remove();
    view.button.setAttribute("aria-expanded", "false");
  };
  const togglePopup = () => {
    if (popup.isConnected) return closePopup();
    document.body.append(popup);
    view.button.setAttribute("aria-expanded", "true");
    renderPopup();
    void refresh();
    void devicePromise.then(renderPopup);
  };
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (popup.isConnected && !popup.contains(target) && !view.item.contains(target)) closePopup();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && popup.isConnected) closePopup();
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown);

  const view = buildItem(togglePopup);
  view.button.setAttribute("aria-haspopup", "dialog");
  view.button.setAttribute("aria-expanded", "false");

  const paint = () => {
    frame = 0;
    const row = document.querySelector(FOOTER_ROW);
    if (row === null) return;
    if (view.item.parentElement !== row || row.lastElementChild !== view.item) row.append(view.item);
    const text = reading === undefined ? "…" : footerText(reading);
    if (view.label.textContent !== text) view.label.textContent = text;
    const summary = reading == null ? null : laptopSummary(reading);
    const description = reading === undefined ? "reading…" : summary === null ? "no battery" : `${summary.percent}%, ${summary.state}`;
    view.button.setAttribute("aria-label", `Battery: ${description}`);
    view.item.toggleAttribute("data-low", isLow(reading ?? null));
    setBatteryLevel(view.level, reading?.percent ?? 0);
    view.bolt.setAttribute("visibility", reading?.state === "charging" ? "visible" : "hidden");
    if (reading == null) view.item.removeAttribute("data-level");
    else view.item.setAttribute("data-level", chargeLevel(reading.percent));
    renderPopup();
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
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown);
    device?.removeEventListener("levelchange", renderPopup);
    device?.removeEventListener("chargingchange", renderPopup);
    popup.remove();
    view.item.remove();
    style.remove();
  };
}
