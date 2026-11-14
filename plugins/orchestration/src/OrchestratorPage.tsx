import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { ThreadChat, useBbNavigate, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button, Message, OrchestrationTab } from "./OrchestrationTab.tsx";
import { chatPreference, clampRailWidth, RAIL, railMode, railOpen, threadFromSubPath, type RailChoice, type RailMode } from "./route.ts";
import { useOrchestratorMembership } from "./useOrchestration.ts";

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

export function useOpenChat() {
  const navigate = useBbNavigate();
  return (threadId: string) => {
    surfacePreference().set(threadId, "chat");
    navigate.toThread(threadId);
  };
}

/** The page body and the title-bar toggle are mounted separately by bb, so they share the rail state here. */
const rail = (() => {
  let choice: RailChoice | null = null;
  let current: { key: string; mode: RailMode } = { key: "", mode: "rail" };
  const listeners = new Set<() => void>();
  let snapshot = false;
  const emit = () => {
    snapshot = railOpen(choice, current.key, current.mode);
    listeners.forEach((l) => l());
  };
  return {
    get: () => snapshot,
    place(key: string, mode: RailMode) {
      if (current.key === key && current.mode === mode) return;
      current = { key, mode };
      emit();
    },
    set(open: boolean) {
      choice = { key: current.key, open };
      emit();
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
  const openChat = useOpenChat();
  if (!threadId) return null;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={open}
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
      <Button variant="quiet" onClick={() => openChat(threadId)}>Full chat</Button>
    </div>
  );
}

function ResizeHandle({ width, onDrag, onDone }: { width: number; onDrag: (w: number | null) => void; onDone: (w: number) => void }) {
  const drag = useRef<{ x: number; w: number; last: number } | null>(null);
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onDrag(null);
    onDone(d.last);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: width, last: width };
        onDrag(width);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.last = d.w + (d.x - e.clientX);
        onDrag(d.last);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-border"
    />
  );
}

function Rail({ threadId, mode, open, pageWidth, focusRequest }: { threadId: string; mode: RailMode; open: boolean; pageWidth: number; focusRequest: number }) {
  const [saved, setSaved] = useState(readWidth);
  const [dragging, setDragging] = useState<number | null>(null);
  const width = clampRailWidth(dragging ?? saved, pageWidth);
  const persist = (w: number) => {
    const next = clampRailWidth(w, pageWidth);
    setSaved(next);
    try {
      storage()?.setItem(WIDTH_KEY, String(next));
    } catch {
      // Width just isn't remembered.
    }
  };
  return (
    <aside
      aria-label="Orchestrator chat"
      inert={!open}
      style={mode === "rail" ? { width: open ? width : 0 } : { width: `min(${RAIL.default}px, calc(100% - 48px))` }}
      className={cx(
        "flex shrink-0 flex-col overflow-hidden border-l border-border bg-sidebar",
        dragging === null && "motion-safe:transition-[width,transform,opacity] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-opacity motion-reduce:duration-150",
        mode === "rail" ? "relative h-full" : "absolute inset-y-0 right-0 z-10 shadow-xl",
        mode === "drawer" && (open ? "translate-x-0" : "translate-x-full"),
        open ? "opacity-100" : "opacity-0",
      )}
    >
      {mode === "rail" && open && <ResizeHandle width={width} onDrag={setDragging} onDone={persist} />}
      <div className="flex h-full min-w-[340px] flex-col">
        <ThreadChat threadId={threadId} variant="compact" layout="contained" focusRequest={focusRequest} className="min-h-0 flex-1" />
      </div>
    </aside>
  );
}

function NotHere({ threadId }: { threadId: string }) {
  const openChat = useOpenChat();
  return (
    <Message
      title="No orchestration here"
      body="This thread isn't named by any orchestration ledger."
      action={<Button variant="primary" onClick={() => openChat(threadId)}>Open chat</Button>}
    />
  );
}

function View({ threadId }: { threadId: string }) {
  const [ref, pageWidth] = useElementWidth<HTMLDivElement>();
  const mode = railMode(pageWidth || 1200);
  const openChat = useOpenChat();
  useLayoutEffect(() => rail.place(`${threadId}:${mode}`, mode), [threadId, mode]);
  const open = useRailOpen();
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (mode !== "drawer" || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) rail.set(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, open]);

  const revealComposer = useCallback(async () => {
    if (!rail.get()) {
      rail.set(true);
      await nextFrame();
    }
    setFocusRequest((n) => n + 1);
  }, []);

  return (
    <div ref={ref} className="relative flex h-full min-h-0 w-full overflow-hidden bg-background">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <OrchestrationTab
          key={threadId}
          threadId={threadId}
          variant="page"
          revealComposer={revealComposer}
          noneAction={<Button variant="primary" onClick={() => openChat(threadId)}>Open chat</Button>}
        />
      </div>
      <Rail threadId={threadId} mode={mode} open={open} pageWidth={pageWidth || 1200} focusRequest={focusRequest} />
    </div>
  );
}

export function OrchestratorPage({ subPath }: PluginNavPanelProps) {
  const threadId = threadFromSubPath(subPath);
  const membership = useOrchestratorMembership(threadId ?? "");
  if (!threadId) return <Message title="Orchestration" body="Open an orchestrator's thread to see its team here." />;
  if (membership === false) return <NotHere threadId={threadId} />;
  if (membership === null) return <Message title="Reading the ledger" body="One moment." />;
  return <View threadId={threadId} />;
}
