import { describeBattery, describeDeviceBattery, footerText, isLow, isRemoteClient, type BatteryReading, type DeviceBattery } from "./battery.ts";

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
[${POPUP_ATTR}] {
  position: fixed; z-index: 50; min-width: 220px; max-width: calc(100vw - 16px); padding: 4px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--popover); color: var(--popover-foreground);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25); font-size: 13px; line-height: 1.35;
}
[${POPUP_ATTR}] [data-row] { padding: 6px 8px; }
[${POPUP_ATTR}] [data-title] { font-size: 11px; color: var(--muted-foreground); }
[${POPUP_ATTR}] [data-value] { font-variant-numeric: tabular-nums; }
[${POPUP_ATTR}] [data-low] [data-value] { color: var(--destructive); }
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

function popupRow(title: string, value: string, low: boolean): HTMLElement {
  const row = document.createElement("div");
  row.setAttribute("data-row", "");
  row.toggleAttribute("data-low", low);
  const heading = document.createElement("div");
  heading.setAttribute("data-title", "");
  heading.textContent = title;
  const text = document.createElement("div");
  text.setAttribute("data-value", "");
  text.textContent = value;
  row.append(heading, text);
  return row;
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
    const rows = [
      popupRow(
        "Laptop",
        reading === undefined ? "Reading battery…" : describeBattery(reading),
        isLow(reading ?? null),
      ),
    ];
    if (device !== null) rows.push(popupRow("This device", describeDeviceBattery(device), false));
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
    const description = reading === undefined ? "Reading battery…" : describeBattery(reading);
    view.button.setAttribute("aria-label", `Battery: ${description}`);
    view.item.toggleAttribute("data-low", isLow(reading ?? null));
    view.level.setAttribute("width", String(Math.max(1, Math.round(((reading?.percent ?? 0) / 100) * 11))));
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
