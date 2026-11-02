import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountFooterPercent } from "./lib/footer-percent.ts";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "footer-battery",
    mount: ({ pluginId, signal }) =>
      mountFooterPercent({ statusUrl: `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/status`, signal }),
  });
});
