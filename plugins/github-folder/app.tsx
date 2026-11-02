import { createPortal } from "react-dom";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { FolderSection } from "@/components/FolderSection";
import { PrPage } from "@/components/PrPage";
import { PR_PANEL_PATH } from "@/lib/pr-context";
import { useBbThreadListAnchor } from "@/lib/sidebar-anchor";

declare const __BB_PLUGIN_ID__: string | undefined;

function BbListFolder() {
  const host = useBbThreadListAnchor(typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : "github-folder");
  return host ? createPortal(<FolderSection />, host) : null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "github-folder", component: BbListFolder });
  app.slots.navPanel({ id: "pr", title: "GitHub", icon: "Github", path: PR_PANEL_PATH, component: PrPage });
});
