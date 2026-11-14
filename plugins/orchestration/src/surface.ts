import { useCallback, useState } from "react";
import { experimental_useRpcMutation, useBbNavigate, useSettings } from "@get-bb/plugin-sdk/app";
import { contract } from "./contract.ts";
import { chatPreference, viewEnabled, VIEW_PATH } from "./route.ts";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const surfacePreference = () => chatPreference(storage());

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

/** The `orchestrationView` setting, with the switch's last choice shown until the setting catches up. */
export function useViewSwitch() {
  const settings = useSettings();
  const mutation = experimental_useRpcMutation({ contract, method: "setOrchestrationView" });
  const [pending, setPending] = useState<boolean | null>(null);
  const stored = viewEnabled(settings.values);
  const on = pending ?? stored;
  if (pending !== null && pending === stored && !mutation.isPending) setPending(null);
  const set = useCallback(async (next: boolean) => {
    setPending(next);
    try {
      await mutation.mutate({ on: next });
    } catch {
      setPending(null);
    }
  }, [mutation]);
  return { on, set, isLoading: settings.isLoading };
}
