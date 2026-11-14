import { useEffect } from "react";
import {
  definePluginApp,
  experimental_THREAD_INFO_ROW_GROUPS as ROW_GROUPS,
  experimental_ThreadContextCardRow as ThreadContextCardRow,
  experimental_useSidebarThreads,
  useBbNavigate,
  type ExperimentalThreadContextCardProps,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { OrchestrationTab } from "./src/OrchestrationTab";
import { OrchestratorHeader, OrchestratorPage, surfacePreference } from "./src/OrchestratorPage";
import { shouldOpenView, threadFromSubPath, VIEW_PATH } from "./src/route";
import { useIsOrchestrator, useOrchestration } from "./src/useOrchestration";

const TAB = { id: "orchestration", context: { kind: "thread" }, availability: "fixed" } as const;

function useOpenView() {
  const navigate = useBbNavigate();
  return (threadId: string, replace = false) => {
    surfacePreference().set(threadId, "view");
    navigate.toPluginPanel(VIEW_PATH, { subPath: threadId, replace });
  };
}

/** bb has no slot for a thread's main area, so the orchestrator's thread view hands over to the plugin page. */
function useTabVisibleAndOpenViewByDefault({ threadId }: { threadId: string }) {
  const isOrchestrator = useIsOrchestrator(threadId);
  const openView = useOpenView();
  useEffect(() => {
    if (shouldOpenView({ isOrchestrator, prefersChat: surfacePreference().prefersChat(threadId) })) openView(threadId, true);
  }, [isOrchestrator, threadId]);
  return isOrchestrator;
}

function StatusRow({ threadId }: ExperimentalThreadContextCardProps) {
  const isOrchestrator = useIsOrchestrator(threadId);
  const state = useOrchestration(threadId, isOrchestrator);
  const openView = useOpenView();
  if (!isOrchestrator || state.kind !== "ready") return null;
  const { view } = state;
  const attention = view.asks.length > 0;
  return (
    <ThreadContextCardRow
      leading={<span aria-hidden className={`size-[7px] rounded-full ${attention ? "bg-attention" : "bg-foreground"}`} />}
      label={view.rowLabel}
      title={`${view.heading}. ${view.subline} Click to open the orchestration view.`}
      onClick={() => openView(threadId)}
    />
  );
}

function usePageTitle({ subPath }: PluginNavPanelProps) {
  const threadId = threadFromSubPath(subPath);
  const title = experimental_useSidebarThreads().threads.find((t) => t.id === threadId)?.displayTitle;
  return threadId && title ? { title, windowTitle: `${title} — Orchestration` } : null;
}

export default definePluginApp((app) => {
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
    useVisible: useTabVisibleAndOpenViewByDefault,
  });
  app.slots.experimental_threadContextCardRow({
    id: "orchestration-status",
    group: ROW_GROUPS.thread,
    order: 60,
    component: StatusRow,
  });
});
