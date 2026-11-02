import { useCallback, useEffect, useRef, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import type { RevealResult, rpcContract } from "./server";
import { Icon } from "@/components/ui/icon";

const HIDE_DELAY_MS = 300;
const FEEDBACK_MS = 1600;

function fileLinkFrom(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  return anchor.getAttribute("href")?.startsWith("file:") ? anchor : null;
}

type Hovered = { href: string; top: number; left: number };
type Feedback = { tone: "ok" | "error"; text: string } | null;

function RevealOverlay() {
  const rpc = useRpc<typeof rpcContract>();
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const feedbackTimer = useRef<number | undefined>(undefined);

  const cancelHide = useCallback(() => window.clearTimeout(hideTimer.current), []);
  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setHovered(null), HIDE_DELAY_MS);
  }, [cancelHide]);

  const reveal = useCallback(
    async (href: string) => {
      let result: RevealResult;
      try {
        result = await rpc.call("reveal", { href });
      } catch (error) {
        result = { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
      setFeedback(result.ok ? { tone: "ok", text: "Shown in Finder" } : { tone: "error", text: result.reason });
      window.clearTimeout(feedbackTimer.current);
      feedbackTimer.current = window.setTimeout(() => setFeedback(null), FEEDBACK_MS);
    },
    [rpc],
  );

  useEffect(() => {
    const onOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const anchor = fileLinkFrom(event.target);
      if (anchor === null) return;
      cancelHide();
      const rect = anchor.getBoundingClientRect();
      setFeedback(null);
      setHovered({ href: anchor.getAttribute("href") ?? "", top: rect.top, left: rect.right });
    };
    const onOut = (event: PointerEvent) => {
      if (fileLinkFrom(event.target) !== null) scheduleHide();
    };
    const onClick = (event: MouseEvent) => {
      if (!event.altKey) return;
      const anchor = fileLinkFrom(event.target);
      if (anchor === null) return;
      event.preventDefault();
      event.stopPropagation();
      void reveal(anchor.getAttribute("href") ?? "");
    };
    const onScroll = () => setHovered(null);
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onScroll, true);
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(feedbackTimer.current);
    };
  }, [cancelHide, scheduleHide, reveal]);

  if (hovered === null) return null;
  return (
    <button
      type="button"
      data-reveal-in-finder=""
      title="Show in Finder (⌥-click the link)"
      onPointerEnter={cancelHide}
      onPointerLeave={scheduleHide}
      onClick={() => void reveal(hovered.href)}
      style={{ position: "fixed", top: hovered.top - 4, left: hovered.left + 4, zIndex: 2147483000 }}
      className={
        "inline-flex h-6 items-center gap-1 rounded-md border border-border bg-popover px-1.5 text-xs shadow-sm " +
        (feedback?.tone === "error" ? "text-destructive" : "text-muted-foreground hover:text-foreground")
      }
    >
      <Icon name="FolderOpen" fallback="Folder" className="size-3.5" aria-hidden />
      <span>{feedback?.text ?? "Finder"}</span>
    </button>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "reveal-in-finder", component: RevealOverlay });
});
