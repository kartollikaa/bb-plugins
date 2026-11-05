import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountStopButtons } from "./lib/stop-buttons.ts";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "background-task-stop",
    mount: ({ pluginId }) => mountStopButtons({ stopUrl: `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/stop` }),
  });
});
