import { useEffect, useRef } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "../server";
import { ARCHIVE_BATCH_GAP_MS, ARCHIVE_UNDO_WINDOW_MS, archiveIsNewerThanTyping, isUndoKey, removedThreadIds } from "./archiveUndo";

function isTextEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(target.type);
}

/** Cmd/Ctrl+Z brings back the threads of the latest archive, unless text typed after it is there to undo. */
export function useArchiveUndo(threadIds: readonly string[], isLoaded: boolean) {
  const rpc = useRpc<typeof rpcContract>();
  const pending = useRef(false);
  const shownIds = useRef<ReadonlySet<string> | null>(null);
  const archiveTimes = useRef<number[]>([]);
  const lastTypedAt = useRef(0);

  useEffect(() => {
    if (!isLoaded) return;
    const previous = shownIds.current;
    shownIds.current = new Set(threadIds);
    if (!previous || removedThreadIds(previous, threadIds).length === 0) return;
    const now = Date.now();
    const times = archiveTimes.current.filter((at) => at >= now - ARCHIVE_UNDO_WINDOW_MS);
    if (times.length > 0 && now - times[times.length - 1]! <= ARCHIVE_BATCH_GAP_MS) times.pop();
    archiveTimes.current = [...times, now];
  }, [threadIds, isLoaded]);

  useEffect(() => {
    const onInput = () => {
      lastTypedAt.current = Date.now();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !isUndoKey(event)) return;
      const times = archiveTimes.current;
      if (isTextEditing(event.target) && !archiveIsNewerThanTyping(times[times.length - 1], lastTypedAt.current)) return;
      event.preventDefault();
      event.stopPropagation();
      times.pop();
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
    window.addEventListener("input", onInput, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("input", onInput, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [rpc]);
}
