import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ProbePage } from "./components/ProbePage.tsx";

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "probe", title: "GenUI probe", icon: "GridView", path: "probe", component: ProbePage });
});
