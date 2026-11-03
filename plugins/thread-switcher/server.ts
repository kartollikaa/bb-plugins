import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { DEFAULT_HOTKEY } from "./lib/hotkey.ts";
import { hotkeySchema, setHotkeyInput, setHotkeyOutput, threadCountSchema } from "./lib/schema.ts";
import { DEFAULT_THREAD_COUNT } from "./lib/switcher.ts";

export const rpcContract = defineRpcContract({
  setHotkey: { input: setHotkeyInput, output: setHotkeyOutput },
});

export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    hotkey: {
      type: "string",
      label: "Hotkey",
      description: "Hold the modifiers and press the key again to move through recent threads; let go to open the selected one. Shift goes back.",
      experimental_schema: hotkeySchema,
      default: DEFAULT_HOTKEY,
    },
    threadCount: {
      type: "number",
      label: "Threads shown",
      description: "How many recent threads the switcher shows.",
      experimental_schema: threadCountSchema,
      default: DEFAULT_THREAD_COUNT,
    },
  });

  bb.rpc.register(rpcContract, {
    async setHotkey({ hotkey }) {
      const next = await settings.experimental_set({ hotkey });
      return { hotkey: next.hotkey };
    },
  });
}
