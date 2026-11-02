import { createPortal } from "react-dom";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { FolderSection } from "@/components/FolderSection";
import { useBbThreadListAnchor } from "@/lib/sidebar-anchor";

declare const __BB_PLUGIN_ID__: string | undefined;

function BbListFolder() {
  const host = useBbThreadListAnchor(typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : "github-folder");
  return host ? createPortal(<FolderSection />, host) : null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "github-folder", component: BbListFolder });
});
