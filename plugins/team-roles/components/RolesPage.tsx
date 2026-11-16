import { type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { parseSubPath } from "@/lib/view";
import { ProposePage } from "@/components/ProposePage";
import { RoleDetail } from "@/components/RoleDetail";
import { RoleList } from "@/components/RoleList";

export function RolesPage({ subPath }: PluginNavPanelProps) {
  const route = parseSubPath(subPath);
  if (route.kind === "propose") return <ProposePage role={route.name} />;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col md:flex-row">
      <div className={route.kind === "role" ? "hidden min-h-0 md:block md:w-[26rem] md:shrink-0 md:border-r md:border-border" : "min-h-0 flex-1 md:flex-none md:w-full"}>
        <RoleList selected={route.kind === "role" ? route.name : null} compact={route.kind === "role"} />
      </div>
      {route.kind === "role" ? <RoleDetail name={route.name} /> : null}
    </div>
  );
}
