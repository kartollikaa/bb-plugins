import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountFooterPill } from "./lib/footer.ts";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "footer-power-pill",
    mount: ({ pluginId, signal }) =>
      mountFooterPill({ baseUrl: `/api/v1/plugins/${encodeURIComponent(pluginId)}/http`, signal }),
  });
});
