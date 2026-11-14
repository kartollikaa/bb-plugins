import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ThreadChat, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button, Message, OrchestrationTab } from "./OrchestrationTab.tsx";
import { chatPlacement, clampRailWidth, dockHeight, RAIL, railMode, railOpen, threadFromSubPath, type ChatPlacement, type RailChoice, type RailMode } from "./route.ts";
import { useOrchestratorMembership } from "./useOrchestration.ts";
import { useOpenChat, useViewSwitch } from "./surface.ts";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");
const WIDTH_KEY = "orchestration.railWidth";

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

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readWidth(): number {
  try {
    return Number(storage()?.getItem(WIDTH_KEY) ?? RAIL.default);
  } catch {
    return RAIL.default;
  }
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size.width, size.height] as const;
}

function PanelIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M10 2.75v10.5" />
    </svg>
  );
}

/** Sits last in the title bar, where bb's thread header puts the matching "Orchestration view" action. */
function ViewSwitch({ onOff }: { onOff: () => void }) {
  const { on, set } = useViewSwitch();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        void set(!on);
        if (on) onOff();
      }}
      className={cx(
        "ml-1 flex h-[26px] items-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-foreground hover:bg-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      )}
    >
      Orchestration view
      <span aria-hidden className={cx("relative h-[14px] w-[24px] rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none", on ? "bg-primary" : "bg-border")}>
        <span className={cx("absolute left-[2px] top-[2px] size-[10px] rounded-full bg-background transition-transform duration-150 ease-out motion-reduce:transition-none", on && "translate-x-[10px]")} />
      </span>
    </button>
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
      <ViewSwitch onOff={() => openChat(threadId)} />
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

/** bb's composer is the sticky footer of `ThreadChat`'s scroller; the dock sizes itself to it. */
function useComposerHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let observed: Element | null = null;
    let frame = 0;
    const ro = new ResizeObserver(([entry]) => setHeight(entry!.target.getBoundingClientRect().height));
    const attach = () => {
      frame = 0;
      const all = root.querySelectorAll('[class~="sticky"][class~="bottom-0"]');
      const el = all[all.length - 1] ?? null;
      if (el === observed) return;
      if (observed) ro.unobserve(observed);
      observed = el;
      if (el) ro.observe(el);
      else setHeight(null);
    };
    attach();
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(attach);
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      ro.disconnect();
    };
  }, [ref]);
  return height;
}

const GRABBER = 16;

function Grabber({ placement }: { placement: ChatPlacement }) {
  const expand = placement === "docked";
  return (
    <button
      type="button"
      aria-label={expand ? "Show chat" : "Hide chat"}
      title={expand ? "Show chat" : "Hide chat"}
      onClick={() => rail.set(expand)}
      style={{ height: GRABBER }}
      className="group flex w-full shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden className="h-1 w-9 rounded-full bg-border group-hover:bg-muted-foreground" />
    </button>
  );
}

function Rail({ threadId, placement, pageWidth, pageHeight, focusRequest, onDockHeight }: { threadId: string; placement: ChatPlacement; pageWidth: number; pageHeight: number; focusRequest: number; onDockHeight: (h: number) => void }) {
  const [saved, setSaved] = useState(readWidth);
  const [dragging, setDragging] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const composer = useComposerHeight(chatRef);
  const width = clampRailWidth(dragging ?? saved, pageWidth);
  const dock = dockHeight(composer, pageHeight || 800);
  useLayoutEffect(() => onDockHeight(dock + GRABBER), [dock, onDockHeight]);
  const persist = (w: number) => {
    const next = clampRailWidth(w, pageWidth);
    setSaved(next);
    try {
      storage()?.setItem(WIDTH_KEY, String(next));
    } catch {
      // Width just isn't remembered.
    }
  };
  const style =
    placement === "rail" ? { width }
    : placement === "sheet" ? { height: "calc(100% - 48px)" }
    : { height: `calc(${dock + GRABBER}px + env(safe-area-inset-bottom))` };
  return (
    <aside
      aria-label="Orchestrator chat"
      data-placement={placement}
      style={style}
      className={cx(
        "flex shrink-0 flex-col overflow-hidden bg-sidebar",
        dragging === null && "motion-safe:transition-[width,height] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]",
        placement === "rail" && "relative h-full border-l border-border",
        placement === "sheet" && "absolute inset-x-0 bottom-0 z-20 rounded-t-xl border-t border-border pb-[env(safe-area-inset-bottom)] shadow-xl",
        placement === "docked" && "absolute inset-x-0 bottom-0 z-10 border-t border-border pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {placement === "rail" && <ResizeHandle width={width} onDrag={setDragging} onDone={persist} />}
      {placement !== "rail" && <Grabber placement={placement} />}
      <div ref={chatRef} className={cx("flex min-h-0 flex-1 flex-col", placement === "rail" ? "min-w-[340px]" : "mx-auto w-full max-w-[720px]")}>
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
  const [ref, pageWidth, pageHeight] = useElementSize<HTMLDivElement>();
  const mode = railMode(pageWidth || 1200);
  const openChat = useOpenChat();
  useLayoutEffect(() => rail.place(`${threadId}:${mode}`, mode), [threadId, mode]);
  const open = useRailOpen();
  const placement = chatPlacement(mode, open);
  const [focusRequest, setFocusRequest] = useState(0);
  const [dockSpace, setDockSpace] = useState(0);

  useEffect(() => {
    if (placement !== "sheet") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) rail.set(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placement]);

  const revealComposer = useCallback(async () => setFocusRequest((n) => n + 1), []);

  return (
    <div ref={ref} className="relative flex h-full min-h-0 w-full overflow-hidden bg-background">
      <div inert={placement === "sheet"} style={{ paddingBottom: placement === "docked" ? dockSpace : 0 }} className="min-w-0 flex-1 overflow-y-auto">
        <OrchestrationTab
          key={threadId}
          threadId={threadId}
          variant="page"
          revealComposer={revealComposer}
          noneAction={<Button variant="primary" onClick={() => openChat(threadId)}>Open chat</Button>}
        />
      </div>
      {placement === "sheet" && <button type="button" aria-label="Hide chat" tabIndex={-1} onClick={() => rail.set(false)} className="absolute inset-0 z-20 bg-background/40" />}
      <Rail threadId={threadId} placement={placement} pageWidth={pageWidth || 1200} pageHeight={pageHeight} focusRequest={focusRequest} onDockHeight={setDockSpace} />
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
