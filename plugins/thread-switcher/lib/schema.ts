import { describeHotkeyError, formatHotkey, parseHotkey } from "./hotkey.ts";
import { MAX_THREAD_COUNT, MIN_THREAD_COUNT } from "./switcher.ts";

type Result<T> = { value: T; issues?: undefined } | { issues: { message: string }[] };

export interface Schema<T> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<T>;
    readonly types?: { readonly input: T; readonly output: T };
  };
}

function schema<T>(validate: (value: unknown) => Result<T>): Schema<T> {
  return { "~standard": { version: 1, vendor: "thread-switcher", validate } };
}

export const hotkeySchema = schema<string>((value) => {
  if (typeof value !== "string") return { issues: [{ message: "Hotkey must be text" }] };
  const error = describeHotkeyError(value);
  return error ? { issues: [{ message: error }] } : { value };
});

export const threadCountSchema = schema<number>((value) =>
  typeof value === "number" && Number.isInteger(value) && value >= MIN_THREAD_COUNT && value <= MAX_THREAD_COUNT
    ? { value }
    : { issues: [{ message: `Use a whole number from ${MIN_THREAD_COUNT} to ${MAX_THREAD_COUNT}` }] },
);

export const setHotkeyInput = schema<{ hotkey: string }>((value) => {
  const hotkey = (value as { hotkey?: unknown } | null)?.hotkey;
  const parsed = typeof hotkey === "string" ? parseHotkey(hotkey) : null;
  if (!parsed) return { issues: [{ message: describeHotkeyError(String(hotkey)) ?? "Invalid hotkey" }] };
  return { value: { hotkey: formatHotkey(parsed) } };
});

export const setHotkeyOutput = schema<{ hotkey: string }>((value) => {
  const hotkey = (value as { hotkey?: unknown } | null)?.hotkey;
  return typeof hotkey === "string" ? { value: { hotkey } } : { issues: [{ message: "Missing hotkey" }] };
});
