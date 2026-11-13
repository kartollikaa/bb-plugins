import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadTreeList } from "./src/ThreadTreeList";
import { hasInboxHandler, openNextInboxItem } from "./src/inbox";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "thread-tree",
    title: "Thread Tree",
    description: "Threads grouped by project, child threads nested under their parent, provider subagents counted on each row.",
    component: ThreadTreeList,
  });
  app.commands.register({
    id: "needs-you-next",
    title: "Needs you: open the next item",
    defaultShortcut: { key: "i", mod: true, shift: true },
    isAvailable: hasInboxHandler,
    run: ({ threadId }) => {
      openNextInboxItem(threadId);
    },
  });
});
