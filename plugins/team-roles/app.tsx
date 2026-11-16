import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { RolesPage } from "@/components/RolesPage";

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "roles", title: "Team roles", icon: "Users", path: "roles", component: RolesPage });
});
