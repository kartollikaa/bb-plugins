import { BATTERY_FLOOR, DURATION_CHOICES, durationLabel, remaining, stateLine, validMinutes, type PillStatus, type StartRequest } from "./pill.ts";

const POLL_MS = 30_000;
const CLOCK_MS = 15_000;
const FOOTER_ROW = '[data-sidebar="footer"] > ul[data-sidebar="menu"]';
const BATTERY_ITEM = "[data-battery-footer]";
const ITEM_ATTR = "data-power-pill";
const POPUP_ATTR = "data-power-pill-popup";
const CHOICE_KEY = "power-pill:choice";
const SVG_NS = "http://www.w3.org/2000/svg";

const STYLE = `
[${ITEM_ATTR}] { flex-shrink: 0; list-style: none; }
[${ITEM_ATTR}] > button {
  display: flex; align-items: center; gap: 5px; height: 32px; padding: 0 8px;
  border: 0; border-radius: 6px; background: transparent; cursor: pointer;
  color: var(--muted-foreground); font: inherit; font-size: 12px; line-height: 1;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
[${ITEM_ATTR}] > button:hover { background: var(--sidebar-accent); color: var(--sidebar-foreground); }
[${ITEM_ATTR}] > button:focus-visible { outline: 2px solid var(--sidebar-ring); outline-offset: -2px; }
[${ITEM_ATTR}][data-on] > button { color: #f59e0b; }
[${ITEM_ATTR}] svg { width: 16px; height: 16px; flex-shrink: 0; }
[data-pill-half] { fill: transparent; transition: fill 160ms ease; }
[data-on] [data-pill-half] { fill: currentColor; }
[${POPUP_ATTR}] {
  position: fixed; z-index: 50; width: 280px; max-width: calc(100vw - 16px); padding: 12px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--popover); color: var(--popover-foreground);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.3); font-size: 13px; line-height: 1.35;
  display: grid; gap: 12px;
}
[${POPUP_ATTR}] [data-head] { display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 10px; }
[${POPUP_ATTR}] [data-tile] {
  display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px;
  background: var(--muted); color: var(--muted-foreground);
}
[${POPUP_ATTR}][data-on] [data-tile] { color: #f59e0b; background: rgb(245 158 11 / 0.14); }
[${POPUP_ATTR}] [data-tile] svg { width: 18px; height: 18px; }
[${POPUP_ATTR}] [data-title] { font-weight: 600; }
[${POPUP_ATTR}] [data-sub] { font-size: 12px; color: var(--muted-foreground); }
[${POPUP_ATTR}] [role="switch"] {
  position: relative; width: 36px; height: 20px; border: 0; border-radius: 999px; padding: 0; cursor: pointer;
  background: var(--input, var(--muted)); transition: background 160ms ease;
}
[${POPUP_ATTR}] [role="switch"]::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 0.3); transition: transform 160ms ease;
}
[${POPUP_ATTR}] [role="switch"][aria-checked="true"] { background: #f59e0b; }
[${POPUP_ATTR}] [role="switch"][aria-checked="true"]::after { transform: translateX(16px); }
[${POPUP_ATTR}] button:disabled { opacity: 0.5; cursor: default; }
[${POPUP_ATTR}] [data-label] { font-size: 12px; color: var(--muted-foreground); margin-bottom: 6px; }
[${POPUP_ATTR}] [data-chips] { display: flex; gap: 4px; }
[${POPUP_ATTR}] [data-chips] button {
  flex: 1; height: 28px; border: 1px solid var(--border); border-radius: 7px; background: transparent; cursor: pointer;
  color: inherit; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums;
}
[${POPUP_ATTR}] [data-chips] button:hover { background: var(--accent); }
[${POPUP_ATTR}] [data-chips] button[aria-pressed="true"] { border-color: #f59e0b; color: #f59e0b; background: rgb(245 158 11 / 0.1); }
[${POPUP_ATTR}] label[data-lid] { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; align-items: start; cursor: pointer; }
[${POPUP_ATTR}] label[data-lid] input { margin: 2px 0 0; accent-color: #f59e0b; }
[${POPUP_ATTR}] label[data-lid] [data-sub] { grid-column: 2; }
[${POPUP_ATTR}] [data-setup] { display: grid; gap: 6px; padding: 8px; border-radius: 8px; background: var(--muted); font-size: 12px; }
[${POPUP_ATTR}] [data-setup] code {
  display: block; max-height: 64px; overflow: auto; padding: 6px; border-radius: 6px; background: var(--background);
  font-size: 11px; word-break: break-all; user-select: all;
}
[${POPUP_ATTR}] [data-setup] button {
  justify-self: start; height: 26px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--background); color: inherit; font: inherit; font-size: 12px; cursor: pointer;
}
[${POPUP_ATTR}] [data-error] { font-size: 12px; color: var(--destructive); }
[${POPUP_ATTR}] [data-hint] { font-size: 12px; color: var(--muted-foreground); }
`;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string>): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function pillIcon(): SVGSVGElement {
  const icon = svg("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  });
  const group = svg("g", { transform: "rotate(-45 12 12)" });
  group.append(
    svg("path", { d: "M12 8H6.5a4 4 0 0 0 0 8H12Z", "data-pill-half": "" }),
    svg("rect", { x: "2.5", y: "8", width: "19", height: "8", rx: "4" }),
    svg("path", { d: "M12 8v8" }),
  );
  icon.append(group);
  return icon;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function readChoice(): StartRequest {
  try {
    const stored = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? "null") as Partial<StartRequest> | null;
    if (stored !== null && validMinutes(stored.minutes) && typeof stored.closedLid === "boolean") {
      return { minutes: stored.minutes, closedLid: stored.closedLid };
    }
  } catch {
    // A corrupt stored choice falls back to the default.
  }
  return { minutes: null, closedLid: false };
}

export function mountFooterPill({ baseUrl, signal }: { baseUrl: string; signal: AbortSignal }): () => void {
  let status: PillStatus | null = null;
  let clockOffset = 0;
  let saved = readChoice();
  let busy = false;
  let error: string | null = null;
  let copied = false;
  let popupDirty = true;
  let frame = 0;
  let stateText: HTMLElement | null = null;
  const now = () => Date.now() + clockOffset;
  const lidReady = () => status?.closedLidReady === true;
  const shown = (): StartRequest => {
    const session = status?.session;
    if (session != null) return { minutes: session.minutes, closedLid: session.closedLid };
    return { minutes: saved.minutes, closedLid: saved.closedLid && lidReady() };
  };

  const style = element("style");
  style.textContent = STYLE;
  document.head.append(style);

  const item = element("li", { [ITEM_ATTR]: "" });
  const button = element("button", { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false" });
  const label = element("span");
  button.append(pillIcon(), label);
  item.append(button);
  const popup = element("div", { [POPUP_ATTR]: "", role: "dialog", "aria-label": "Power Pill" });

  const invalidate = () => {
    popupDirty = true;
    schedule();
  };

  const accept = (next: PillStatus) => {
    const changed = JSON.stringify({ ...next, now: 0 }) !== JSON.stringify({ ...status, now: 0 });
    status = next;
    clockOffset = next.now - Date.now();
    if (changed) invalidate();
    else schedule();
  };

  const refresh = async () => {
    try {
      const response = await fetch(`${baseUrl}/status`, { signal, credentials: "same-origin" });
      if (response.ok) accept((await response.json()) as PillStatus);
    } catch {
      // A failed poll keeps the last state on screen.
    }
  };

  const send = async (path: "/start" | "/stop", body?: StartRequest) => {
    busy = true;
    error = null;
    invalidate();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        signal,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = (await response.json().catch(() => null)) as (PillStatus & { error?: string }) | null;
      if (response.ok && payload !== null) accept(payload);
      else {
        error = payload?.error ?? `Request failed (${response.status})`;
        void refresh();
      }
    } catch (failure) {
      if (!signal.aborted) error = (failure as Error).message;
    } finally {
      busy = false;
      invalidate();
    }
  };

  const save = (next: StartRequest) => {
    saved = next;
    localStorage.setItem(CHOICE_KEY, JSON.stringify(saved));
  };

  const pickDuration = (minutes: number | null) => {
    const current = shown();
    save({ ...saved, minutes });
    if (status?.session != null) void send("/start", { minutes, closedLid: current.closedLid });
    else invalidate();
  };

  const pickLid = (closedLid: boolean) => {
    const current = shown();
    save({ ...saved, closedLid });
    if (status?.session != null) void send("/start", { minutes: current.minutes, closedLid, keepEnd: true });
    else invalidate();
  };

  function renderPopup() {
    popupDirty = false;
    const on = status?.session != null;
    const current = shown();
    popup.toggleAttribute("data-on", on);

    const head = element("div", { "data-head": "" });
    const tile = element("div", { "data-tile": "" });
    tile.append(pillIcon());
    const text = element("div");
    stateText = element("div", { "data-sub": "" }, status === null ? "Loading…" : stateLine(status, now()));
    text.append(element("div", { "data-title": "" }, "Power Pill"), stateText);
    const toggle = element("button", { type: "button", role: "switch", "aria-checked": String(on), "aria-label": "Keep the Mac awake" });
    toggle.disabled = busy || status === null;
    toggle.addEventListener("click", () => void (on ? send("/stop") : send("/start", current)));
    head.append(tile, text, toggle);

    const durations = element("div");
    const chips = element("div", { "data-chips": "" });
    for (const minutes of DURATION_CHOICES) {
      const chip = element("button", { type: "button", "aria-pressed": String(current.minutes === minutes) }, durationLabel(minutes));
      chip.title = minutes === null ? "Until you turn it off" : `For ${durationLabel(minutes)}`;
      chip.disabled = busy;
      chip.addEventListener("click", () => pickDuration(minutes));
      chips.append(chip);
    }
    durations.append(element("div", { "data-label": "" }, "Duration"), chips);

    const lid = element("label", { "data-lid": "" });
    const checkbox = element("input", { type: "checkbox" });
    checkbox.checked = current.closedLid;
    checkbox.disabled = busy || !lidReady();
    checkbox.addEventListener("change", () => pickLid(checkbox.checked));
    lid.append(
      checkbox,
      element("span", {}, "Also with the lid closed"),
      element("span", { "data-sub": "" }, `Turns itself off at ${status?.batteryFloor ?? BATTERY_FLOOR}% battery. Keep the Mac out of a bag.`),
    );

    const parts: HTMLElement[] = [head, durations, lid];
    if (status !== null && !lidReady()) {
      const setup = element("div", { "data-setup": "" });
      const copy = element("button", { type: "button" }, copied ? "Copied" : "Copy command");
      copy.addEventListener("click", () => {
        void navigator.clipboard?.writeText(status?.setupCommand ?? "").then(() => {
          copied = true;
          invalidate();
        });
      });
      setup.append(
        element("span", {}, "Closed-lid mode needs a one-time sudo rule. Run this in Terminal:"),
        element("code", {}, status.setupCommand),
        copy,
      );
      parts.push(setup);
    }
    if (error !== null) parts.push(element("div", { "data-error": "", role: "alert" }, error));
    parts.push(element("div", { "data-hint": "" }, "Locking the screen doesn't stop it; the display still turns off."));
    popup.replaceChildren(...parts);

    const anchor = button.getBoundingClientRect();
    popup.style.bottom = `${window.innerHeight - anchor.top + 6}px`;
    popup.style.left = `${Math.min(Math.max(8, anchor.left), window.innerWidth - popup.offsetWidth - 8)}px`;
  }

  const closePopup = () => {
    popup.remove();
    button.setAttribute("aria-expanded", "false");
  };
  button.addEventListener("click", () => {
    if (popup.isConnected) return closePopup();
    error = null;
    copied = false;
    document.body.append(popup);
    button.setAttribute("aria-expanded", "true");
    renderPopup();
    void refresh();
  });
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (popup.isConnected && !popup.contains(target) && !item.contains(target)) closePopup();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && popup.isConnected) closePopup();
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown);

  const placed = (row: Element) => {
    const battery = row.querySelector(`:scope > ${BATTERY_ITEM}`);
    return item.parentElement === row && (battery === null ? row.lastElementChild === item : item.nextElementSibling === battery);
  };

  const paint = () => {
    frame = 0;
    const row = document.querySelector(FOOTER_ROW);
    if (row !== null && !placed(row)) row.insertBefore(item, row.querySelector(`:scope > ${BATTERY_ITEM}`));
    const session = status?.session ?? null;
    item.toggleAttribute("data-on", session !== null);
    const text = session === null ? "" : (remaining(session, now()) ?? "");
    if (label.textContent !== text) label.textContent = text;
    label.hidden = text === "";
    const line = status === null ? null : stateLine(status, now());
    const description = line === null ? "Power Pill" : `Power Pill: ${line}`;
    button.setAttribute("aria-label", description);
    button.title = description;
    if (!popup.isConnected) return;
    if (popupDirty) renderPopup();
    else if (stateText !== null && line !== null && stateText.textContent !== line) stateText.textContent = line;
  };
  function schedule() {
    if (frame === 0) frame = requestAnimationFrame(paint);
  }

  const observer = new MutationObserver(() => {
    const row = item.parentElement;
    if (row === null || !row.isConnected || !placed(row)) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const onVisible = () => {
    if (document.visibilityState === "visible") void refresh();
  };
  document.addEventListener("visibilitychange", onVisible);
  const poll = setInterval(() => void refresh(), POLL_MS);
  const clock = setInterval(schedule, CLOCK_MS);
  schedule();
  void refresh();

  return () => {
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(poll);
    clearInterval(clock);
    if (frame !== 0) cancelAnimationFrame(frame);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown);
    popup.remove();
    item.remove();
    style.remove();
  };
}
