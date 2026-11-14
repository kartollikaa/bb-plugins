import { useCallback, useEffect, useSyncExternalStore } from "react";
import { experimental_useRpcMutation, useBbNavigate, useSettings } from "@get-bb/plugin-sdk/app";
import { contract } from "./contract.ts";
import { chatPreference, viewEnabled, VIEW_PATH } from "./route.ts";
import { pendingSwitch } from "./switch.ts";
import { localStore } from "./storage.ts";

export const surfacePreference = () => chatPreference(localStore());

export function useOpenChat() {
  const navigate = useBbNavigate();
  return (threadId: string) => {
    surfacePreference().set(threadId, "chat");
    navigate.toThread(threadId);
  };
}

export function useOpenView() {
  const navigate = useBbNavigate();
  return (threadId: string, replace: boolean) => {
    surfacePreference().set(threadId, "view");
    navigate.toPluginPanel(VIEW_PATH, { subPath: threadId, replace });
  };
}

const pending = pendingSwitch();

/** The `orchestrationView` setting, with the switch's last choice shown until the setting catches up. */
export function useViewSwitch() {
  const settings = useSettings();
  const mutation = experimental_useRpcMutation({ contract, method: "setOrchestrationView" });
  const choice = useSyncExternalStore(pending.subscribe, pending.get);
  const stored = viewEnabled(settings.values);
  useEffect(() => pending.settle(stored), [stored, choice]);
  const set = useCallback(async (next: boolean) => {
    pending.set(next);
    try {
      await mutation.mutate({ on: next });
    } catch {
      pending.clear();
    }
  }, [mutation]);
  return { on: choice ?? stored, set, isLoading: settings.isLoading };
}
