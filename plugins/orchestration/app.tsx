import {
  definePluginApp,
  experimental_THREAD_INFO_ROW_GROUPS as ROW_GROUPS,
  experimental_ThreadContextCardRow as ThreadContextCardRow,
  experimental_useAppPanel,
  type ExperimentalThreadContextCardProps,
} from "@get-bb/plugin-sdk/app";
import { OrchestrationTab } from "./src/OrchestrationTab";
import { useIsOrchestrator, useOrchestration } from "./src/useOrchestration";

const TAB = { id: "orchestration", context: { kind: "thread" }, availability: "fixed" } as const;

function StatusRow({ threadId }: ExperimentalThreadContextCardProps) {
  const isOrchestrator = useIsOrchestrator(threadId);
  const state = useOrchestration(threadId, isOrchestrator);
  const panel = experimental_useAppPanel();
  if (!isOrchestrator || state.kind !== "ready") return null;
  const { view } = state;
  const attention = view.asks.length > 0;
  return (
    <ThreadContextCardRow
      leading={<span aria-hidden className={`size-[7px] rounded-full ${attention ? "bg-attention" : "bg-foreground"}`} />}
      label={view.heading}
      title={`${view.heading}. ${view.subline}`}
      onClick={() => panel.openTab({ tab: TAB })}
    />
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_tab({
    ...TAB,
    title: "Orchestration",
    icon: "Network",
    component: OrchestrationTab,
    layout: "flush",
    useVisible: ({ threadId }) => useIsOrchestrator(threadId),
  });
  app.slots.experimental_threadContextCardRow({
    id: "orchestration-status",
    group: ROW_GROUPS.thread,
    order: 60,
    component: StatusRow,
  });
});
