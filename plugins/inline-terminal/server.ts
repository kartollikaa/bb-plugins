import type { BbPluginApi } from "@get-bb/plugin-sdk";

/** Frontend-only plugin: terminals are created through the app SDK, so the server has nothing to own. */
export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");
}
