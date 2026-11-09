import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { BoardPage } from "@/components/BoardPage";

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "board", title: "Kaiten", icon: "Columns", path: "board", component: BoardPage });
});
