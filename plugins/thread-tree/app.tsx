import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadTreeList } from "./src/ThreadTreeList";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "thread-tree",
    title: "Thread Tree",
    description: "Threads grouped by project, child threads nested under their parent, provider subagents counted on each row.",
    component: ThreadTreeList,
  });
});
