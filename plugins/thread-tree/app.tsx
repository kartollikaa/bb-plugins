import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { SubagentTreeList } from "./src/SubagentTreeList";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "subagent-tree",
    title: "Subagent Tree",
    description: "Threads grouped by project, child threads nested under their parent, provider subagents counted on each row.",
    component: SubagentTreeList,
  });
});
