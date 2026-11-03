export const DEFAULT_HOTKEY = "Control+Tab";

export interface Hotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

export interface KeyLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_ALIASES: Record<string, keyof Omit<Hotkey, "key">> = {
  control: "ctrl",
  ctrl: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
};

const NAMED_KEYS: Record<string, string> = {
  tab: "Tab",
  space: "Space",
  enter: "Enter",
  backquote: "`",
  "`": "`",
  backslash: "\\",
  "\\": "\\",
  bracketleft: "[",
  "[": "[",
  bracketright: "]",
  "]": "]",
  comma: ",",
  ",": ",",
  period: ".",
  ".": ".",
  slash: "/",
  "/": "/",
  semicolon: ";",
  ";": ";",
  quote: "'",
  "'": "'",
  minus: "-",
  "-": "-",
  equal: "=",
  "=": "=",
  arrowup: "ArrowUp",
  up: "ArrowUp",
  arrowdown: "ArrowDown",
  down: "ArrowDown",
  arrowleft: "ArrowLeft",
  left: "ArrowLeft",
  arrowright: "ArrowRight",
  right: "ArrowRight",
  pageup: "PageUp",
  pagedown: "PageDown",
  home: "Home",
  end: "End",
};

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

export function normalizeKeyName(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  const lower = value.toLowerCase();
  if (NAMED_KEYS[lower]) return NAMED_KEYS[lower];
  if (/^[a-z0-9]$/i.test(value)) return value.toUpperCase();
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(value)) return value.toUpperCase();
  return null;
}

/** Event `code` keeps the physical key, so Option+K reads as K, not ˚. */
export function keyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!;
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1]!;
  return normalizeKeyName(code);
}

export function parseHotkey(input: string): Hotkey | null {
  const parts = input.split("+").map((part) => part.trim());
  if (parts.some((part) => part === "")) return null;
  const hotkey: Hotkey = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (!modifier) return null;
    hotkey[modifier] = true;
  }
  const key = normalizeKeyName(parts[parts.length - 1]!);
  if (!key) return null;
  hotkey.key = key;
  if (!hotkey.ctrl && !hotkey.alt && !hotkey.meta) return null;
  return hotkey;
}

export function formatHotkey(hotkey: Hotkey): string {
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push("Control");
  if (hotkey.alt) parts.push("Option");
  if (hotkey.shift) parts.push("Shift");
  if (hotkey.meta) parts.push("Command");
  parts.push(hotkey.key);
  return parts.join("+");
}

export function hotkeyFromEvent(event: KeyLike): Hotkey | null {
  if (MODIFIER_CODES.has(event.code)) return null;
  const key = keyFromCode(event.code);
  if (!key) return null;
  if (!event.ctrlKey && !event.altKey && !event.metaKey) return null;
  return {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key,
  };
}

export type HotkeyMatch = "forward" | "backward" | null;

/** Shift reverses the direction unless the hotkey itself uses Shift. */
export function matchHotkey(event: KeyLike, hotkey: Hotkey): HotkeyMatch {
  if (keyFromCode(event.code) !== hotkey.key) return null;
  if (event.ctrlKey !== hotkey.ctrl || event.altKey !== hotkey.alt || event.metaKey !== hotkey.meta) {
    return null;
  }
  if (hotkey.shift) return event.shiftKey ? "forward" : null;
  return event.shiftKey ? "backward" : "forward";
}

/** The switch commits as soon as any modifier of the hotkey is let go. */
export function hotkeyModifierReleased(
  event: Pick<KeyLike, "ctrlKey" | "altKey" | "metaKey">,
  hotkey: Hotkey,
): boolean {
  return (
    (hotkey.ctrl && !event.ctrlKey) ||
    (hotkey.alt && !event.altKey) ||
    (hotkey.meta && !event.metaKey)
  );
}

export function describeHotkeyError(input: string): string | null {
  return parseHotkey(input)
    ? null
    : "Use modifiers and a key joined by +, with Control, Option or Command, e.g. Control+Tab";
}
