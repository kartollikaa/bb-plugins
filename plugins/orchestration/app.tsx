import { useMemo } from "react";
import {
  definePluginApp,
  experimental_THREAD_ACTION_GROUPS as ACTION_GROUPS,
  experimental_THREAD_INFO_ROW_GROUPS as ROW_GROUPS,
  experimental_useRpcKeyedQuery,
  experimental_ThreadContextCardRow as ThreadContextCardRow,
  experimental_useSidebarThreads,
  experimental_useAppPanel,
  type ExperimentalThreadContextCardProps,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { contract } from "./src/contract";
import { OrchestrationTab } from "./src/OrchestrationTab";
import { OrchestratorHeader, OrchestratorPage } from "./src/OrchestratorPage";
import { NavigationBridge } from "./src/NavigationBridge";
import { useOpenView, useViewSwitch } from "./src/surface";
import { threadFromSubPath, VIEW_PATH } from "./src/route";
import { orchestratorLookupKeys } from "./src/switch";
import { useIsOrchestrator, useOrchestration } from "./src/useOrchestration";

const TAB = { id: "orchestration", context: { kind: "thread" }, availability: "fixed" } as const;

function useTabVisible({ threadId }: { threadId: string }) {
  return useIsOrchestrator(threadId);
}

function StatusRow({ threadId }: ExperimentalThreadContextCardProps) {
  const isOrchestrator = useIsOrchestrator(threadId);
  const state = useOrchestration(threadId, isOrchestrator);
  const openView = useOpenView();
  const panel = experimental_useAppPanel();
  const viewSwitch = useViewSwitch();
  if (!isOrchestrator || state.kind !== "ready") return null;
  const { view } = state;
  const attention = view.asks.length > 0;
  return (
    <ThreadContextCardRow
      leading={<span aria-hidden className={`size-[7px] rounded-full ${attention ? "bg-attention" : "bg-foreground"}`} />}
      label={view.rowLabel}
      title={`${view.heading}. ${view.subline}`}
      onClick={() => (viewSwitch.on ? openView(threadId, true) : panel.openTab({ tab: TAB }))}
    />
  );
}

interface SwitchData {
  orchestrators: Record<string, boolean>;
  turnOn(threadId: string): void;
}

/** The thread-header twin of the view's title-bar switch: it shows the view as off, and turning it on opens the view. */
function useSwitchData({ threadIds }: { threadIds: readonly string[] }): SwitchData {
  const keys = useMemo(() => orchestratorLookupKeys(threadIds), [threadIds]);
  const query = experimental_useRpcKeyedQuery({ contract, method: "isOrchestrator", keys, enabled: keys.length > 0 });
  const viewSwitch = useViewSwitch();
  const openView = useOpenView();
  return {
    orchestrators: query.data ?? {},
    turnOn(threadId) {
      void viewSwitch.set(true);
      openView(threadId, true);
    },
  };
}

function usePageTitle({ subPath }: PluginNavPanelProps) {
  const threadId = threadFromSubPath(subPath);
  const title = experimental_useSidebarThreads().threads.find((t) => t.id === threadId)?.displayTitle;
  return threadId && title ? { breadcrumbs: [], windowTitle: `${title} — Orchestration` } : null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "orchestration-navigation", component: NavigationBridge });
  app.slots.navPanel({
    id: "orchestrator",
    title: "Orchestration",
    icon: "orchestration/network",
    path: VIEW_PATH,
    component: OrchestratorPage,
    headerContent: OrchestratorHeader,
    experimental_usePageTitle: usePageTitle,
  });
  app.slots.experimental_tab({
    ...TAB,
    title: "Orchestration",
    icon: "orchestration/network",
    component: OrchestrationTab,
    layout: "flush",
    useVisible: useTabVisible,
  });
  app.slots.experimental_threadAction<SwitchData>({
    id: "orchestration-view",
    title: "Orchestration view",
    icon: "orchestration/toggle-off",
    group: ACTION_GROUPS.open,
    placement: "header",
    useData: useSwitchData,
    item: ({ thread, data }) => (data.orchestrators[thread.id] ? {
      label: "Orchestration view",
      detail: "Off",
      icon: "orchestration/toggle-off",
      run: () => data.turnOn(thread.id),
    } : null),
  });
  app.slots.experimental_threadContextCardRow({
    id: "orchestration-status",
    group: ROW_GROUPS.thread,
    order: 60,
    component: StatusRow,
  });
});
