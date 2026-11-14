import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { ThreadChat, useBbNavigate, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button, Message, OrchestrationTab } from "./OrchestrationTab.tsx";
import { chatPreference, clampRailWidth, RAIL, railMode, threadFromSubPath } from "./route.ts";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
const WIDTH_KEY = "orchestration.railWidth";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const surfacePreference = () => chatPreference(storage());

/** The rail's open state is shared by the page body and the title-bar toggle, which bb mounts separately. */
const rail = (() => {
  let open: boolean | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => open,
    set(next: boolean) {
      open = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
})();

const useRailOpen = () => useSyncExternalStore(rail.subscribe, rail.get, rail.get);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

function readWidth(): number {
  try {
    return Number(storage()?.getItem(WIDTH_KEY) ?? RAIL.default);
  } catch {
    return RAIL.default;
  }
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function PanelIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M10 2.75v10.5" />
    </svg>
  );
}

export function OrchestratorHeader({ subPath }: PluginNavPanelProps) {
  const threadId = threadFromSubPath(subPath);
  const open = useRailOpen();
  const navigate = useBbNavigate();
  if (!threadId) return null;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={open === true}
        title={open ? "Hide chat" : "Show chat"}
        onClick={() => rail.set(!open)}
        className={cx(
          "flex h-[26px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          open && "text-foreground",
        )}
      >
        <PanelIcon />
        Chat
      </button>
      <Button
        variant="quiet"
        onClick={() => {
          surfacePreference().set(threadId, "chat");
          navigate.toThread(threadId);
        }}
      >
        Full chat
      </Button>
    </div>
  );
}

function Rail({ threadId, mode, open, width, onResize, focusRequest }: { threadId: string; mode: "rail" | "drawer"; open: boolean; width: number; onResize: (w: number) => void; focusRequest: number }) {
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => onResize(startW + (startX - ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <aside
      aria-label="Orchestrator chat"
      inert={!open}
      style={mode === "rail" ? { width: open ? width : 0 } : { width: `min(${RAIL.default}px, calc(100% - 48px))` }}
      className={cx(
        "relative flex shrink-0 flex-col overflow-hidden bg-sidebar",
        "motion-safe:transition-[width,transform,opacity] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]",
        "motion-reduce:transition-opacity motion-reduce:duration-150",
        mode === "rail" ? "h-full border-l border-border" : "absolute inset-y-0 right-0 z-10 border-l border-border shadow-xl",
        mode === "drawer" && (open ? "translate-x-0" : "translate-x-full"),
        open ? "opacity-100" : "opacity-0",
      )}
    >
      {mode === "rail" && open && (
        <div role="separator" aria-orientation="vertical" aria-label="Resize chat" onPointerDown={startDrag} className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-border" />
      )}
      <div className="flex h-full min-w-[340px] flex-col">
        <ThreadChat threadId={threadId} variant="compact" layout="contained" focusRequest={focusRequest} className="min-h-0 flex-1" />
      </div>
    </aside>
  );
}

export function OrchestratorPage({ subPath }: PluginNavPanelProps) {
  const threadId = threadFromSubPath(subPath);
  const navigate = useBbNavigate();
  const [ref, pageWidth] = useElementWidth<HTMLDivElement>();
  const mode = railMode(pageWidth || 1200);
  const stored = useRailOpen();
  const open = stored ?? mode === "rail";
  const [width, setWidth] = useState(readWidth);
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (stored === null && pageWidth > 0) rail.set(mode === "rail");
  }, [stored, mode, pageWidth]);

  useEffect(() => {
    if (mode !== "drawer" || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") rail.set(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, open]);

  const resize = useCallback((w: number) => {
    const next = clampRailWidth(w, pageWidth);
    setWidth(next);
    try {
      storage()?.setItem(WIDTH_KEY, String(next));
    } catch {
      // Width just isn't remembered.
    }
  }, [pageWidth]);

  const revealComposer = useCallback(async () => {
    if (rail.get() !== true) {
      rail.set(true);
      await nextFrame();
    }
    setFocusRequest((n) => n + 1);
  }, []);

  if (!threadId) {
    return <Message title="Orchestration" body="Open an orchestrator's thread to see its team here." />;
  }

  return (
    <div ref={ref} className="relative flex h-full min-h-0 w-full overflow-hidden bg-background">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <OrchestrationTab
          key={threadId}
          threadId={threadId}
          revealComposer={revealComposer}
          className="mx-auto h-auto max-w-[680px] overflow-visible px-6 pt-6"
          noneAction={<Button variant="primary" onClick={() => navigate.toThread(threadId)}>Open chat</Button>}
        />
      </div>
      <Rail threadId={threadId} mode={mode} open={open} width={clampRailWidth(width, pageWidth || 1200)} onResize={resize} focusRequest={focusRequest} />
    </div>
  );
}
