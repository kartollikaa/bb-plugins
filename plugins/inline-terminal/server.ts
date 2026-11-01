import type { BbPluginApi } from "@get-bb/plugin-sdk";

/** Terminals and sends go through the app SDK; the server only declares settings. */
export default async function plugin(bb: BbPluginApi) {
  bb.settings.define({
    autoSendResult: {
      type: "boolean",
      label: "Send command results to the chat",
      description:
        "When a command started from a code block finishes, post its exit code and output to the thread so the agent replies.",
      default: true,
    },
  });
}
