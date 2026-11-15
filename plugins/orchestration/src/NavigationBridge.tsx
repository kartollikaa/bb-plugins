import { useEffect, useLayoutEffect, useRef } from "react";
import { useBbContext, useBbNavigate, useRpc, useSidebarSplitLayout } from "@get-bb/plugin-sdk/app";
import { contract } from "./contract.ts";
import { createThreadNavigation, navigationOwners, plainClick, threadLink } from "./navigation.ts";
import { surfacePreference, useOpenView, useViewSwitch } from "./surface.ts";
import { isThreadId, shouldOpenView } from "./route.ts";
import { useOrchestrationOwner, useOwnershipIndex, useVisibleInterval } from "./useOrchestration.ts";

export function NavigationBridge() {
  const index = useOwnershipIndex();
  useVisibleInterval(index.refetch, 60_000);
  const viewSwitch = useViewSwitch();
  const inSplit = useSidebarSplitLayout() !== null;
  const rpc = useRpc<typeof contract>();
  const navigate = useBbNavigate();
  const openView = useOpenView();
  const context = useBbContext();
  const owner = useOrchestrationOwner(context.threadId ?? "");
  const decided = useRef<string | null>(null);
  const latest = useRef({ index, viewSwitch, inSplit, rpc, navigate, openView });
  useLayoutEffect(() => { latest.current = { index, viewSwitch, inSplit, rpc, navigate, openView }; });
  const navigation = useRef<ReturnType<typeof createThreadNavigation> | null>(null);
  if (!navigation.current) navigation.current = createThreadNavigation({
    enabled: (id) => latest.current.viewSwitch.on && !latest.current.viewSwitch.isLoading && !latest.current.inSplit && !surfacePreference().prefersChat(id),
    owner: (id) => latest.current.index.owner(id),
    resolve: async (id) => (await latest.current.rpc.call("owner", { threadId: id })).owner,
    location: () => window.location.href,
    openView: (owner, id) => latest.current.openView(owner, false, id),
    openChat: (id) => latest.current.navigate.toThread(id),
  }, navigationOwners);
  useLayoutEffect(() => { navigation.current!.cancel(); }, [context.projectId, context.threadId, inSplit]);
  useLayoutEffect(() => {
    const id = context.threadId;
    if (!id) { decided.current = null; return; }
    if (owner === undefined || viewSwitch.isLoading) return;
    if (threadLink(window.location.href, window.location.href) !== id) { decided.current = id; return; }
    const open = shouldOpenView({ enabled: viewSwitch.on, membership: owner !== null, prefersChat: surfacePreference().prefersChat(id), inSplit, decided: decided.current === id });
    decided.current = id;
    if (open && owner) openView(owner, true, id);
  }, [context.threadId, owner, inSplit, viewSwitch.isLoading, viewSwitch.on]);
  useEffect(() => {
    const controller = navigation.current!;
    const cancel = () => controller.cancel();
    const request = (event: Event) => {
      controller.cancel();
      if (!(event instanceof CustomEvent) || event.defaultPrevented || !event.cancelable) return;
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== "object" || !("threadId" in detail) || typeof detail.threadId !== "string" || !isThreadId(detail.threadId) || !("split" in detail) || detail.split !== false) return;
      if (controller.open(detail.threadId)) event.preventDefault();
    };
    const anchor = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    const click = (event: MouseEvent) => {
      controller.cancel();
      const link = anchor(event);
      if (!link || !plainClick(event, link.target, link.hasAttribute("download"))) return;
      const id = threadLink(link.href, window.location.href);
      if (!id || !controller.open(id, true)) return;
      event.preventDefault();
    };
    const preload = (event: Event) => {
      const link = anchor(event);
      const id = link && !link.target && !link.hasAttribute("download") ? threadLink(link.href, window.location.href) : null;
      if (id) controller.preload(id);
    };
    document.addEventListener("click", click, true);
    document.addEventListener("pointerover", preload, true);
    document.addEventListener("focusin", preload, true);
    window.addEventListener("popstate", cancel);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("thread-tree:open-thread", request);
    return () => {
      controller.cancel();
      document.removeEventListener("click", click, true);
      document.removeEventListener("pointerover", preload, true);
      document.removeEventListener("focusin", preload, true);
      window.removeEventListener("popstate", cancel);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("thread-tree:open-thread", request);
    };
  }, []);
  return null;
}
