import { useEffect, useRef } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "../server";
import { isUndoKey } from "./archiveUndo";

function isTextEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(target.type);
}

/** Cmd/Ctrl+Z outside a text field brings back the threads of the latest archive. */
export function useArchiveUndo() {
  const rpc = useRpc<typeof rpcContract>();
  const pending = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isUndoKey(event) || isTextEditing(event.target)) return;
      event.preventDefault();
      if (pending.current) return;
      pending.current = true;
      rpc
        .call("undoArchive", null)
        .then(({ restored, failed }) => {
          if (restored.length === 1) toast.success(`Restored “${restored[0]!.title}”`);
          else if (restored.length > 1) toast.success(`Restored ${restored.length} threads`);
          for (const thread of failed) toast.error(`Couldn't restore “${thread.title}”`, { description: thread.error });
        })
        .catch((error: unknown) => {
          toast.error("Couldn't undo the archive", { description: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => {
          pending.current = false;
        });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rpc]);
}
