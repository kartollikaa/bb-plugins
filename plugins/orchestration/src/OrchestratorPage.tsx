import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ThreadChat, experimental_useSidebarThreads, useSdk, useBbNavigate, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { Button, Message, OrchestrationTab } from "./OrchestrationTab.tsx";
import { chatFromSubPath, chatPlacement, clampRailWidth, dockHeight, RAIL, railMode, railOpen, SHEET, sheetGestureOwner, sheetHeightWhileDragging, sheetSettles, threadFromSubPath, type ChatPlacement, type RailChoice, type RailMode } from "./route.ts";
import { useOrchestratorMembership, useOrchestrationOwner } from "./useOrchestration.ts";
import { useOpenChat, useOpenView, useViewSwitch } from "./surface.ts";
import { localStore } from "./storage.ts";

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

function readWidth(): number {
  try {
    return Number(localStore()?.getItem(WIDTH_KEY) ?? RAIL.default);
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
      aria-label="Orchestration view"
      title="Orchestration view"
      onClick={() => {
        void set(!on);
        if (on) onOff();
      }}
      className={cx(
        "ml-1 flex h-[26px] items-center gap-2 rounded-md border max-sm:hidden border-border px-2 text-xs font-medium text-foreground hover:bg-accent",
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
  const threadId = chatFromSubPath(subPath);
  const open = useRailOpen();
  const openChat = useOpenChat();
  if (!threadId) return null;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={open}
        title={open ? "Hide chat" : "Show chat"}
        aria-label="Chat"
        onClick={() => rail.set(!open)}
        className={cx(
          "flex h-[26px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground max-sm:hidden hover:bg-accent hover:text-foreground",
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

/** Makes everything in `root` but `keep` and its ancestors inert; returns the elements it changed. */
function inertAround(keep: Element, root: Element): Element[] {
  const changed: Element[] = [];
  for (let node: Element | null = keep; node && node !== root; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling !== node && !sibling.hasAttribute("inert")) {
        sibling.setAttribute("inert", "");
        changed.push(sibling);
      }
    }
  }
  return changed;
}

/**
 * bb's composer is the sticky footer of `ThreadChat`'s scroller. While docked, the dock sizes itself
 * to it and the hidden transcript around it is made inert, so Tab and screen readers skip it.
 */
function useDockedComposer(ref: RefObject<HTMLElement | null>, docked: boolean) {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !docked) return;
    let observed: Element | null = null;
    let inert: Element[] = [];
    let frame = 0;
    const release = () => {
      inert.forEach((el) => el.removeAttribute("inert"));
      inert = [];
    };
    const ro = new ResizeObserver(([entry]) => setHeight(entry!.target.getBoundingClientRect().height));
    const attach = () => {
      frame = 0;
      const all = root.querySelectorAll('[class~="sticky"][class~="bottom-0"]');
      const el = all[all.length - 1] ?? null;
      release();
      if (el) inert = inertAround(el, root);
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
      release();
    };
  }, [ref, docked]);
  return height;
}

const GRABBER = 24;
const SHEET_HEADER = 44;

interface SheetDrag {
  from: number;
  min: number;
  max: number;
  onMove: (height: number | null) => void;
}

function scrollerOf(target: Element, root: Element): HTMLElement | null {
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
  }
  return null;
}

/** Touch drags anywhere on the folded dock or the open sheet move it; see `sheetGestureOwner`. */
function useSheetTouch(ref: RefObject<HTMLElement | null>, placement: ChatPlacement, drag: SheetDrag) {
  const latest = useRef(drag);
  latest.current = drag;
  useEffect(() => {
    const root = ref.current;
    if (!root || placement === "rail") return;
    const open = placement === "sheet";
    let g: { x: number; y: number; lastY: number; lastT: number; v: number; inHandle: boolean; scroller: HTMLElement | null; owner: "sheet" | "content" | null } | null = null;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t) {
        g = null;
        return;
      }
      const target = e.target as Element;
      const inHandle = !!target.closest("[data-sheet-handle]") || !!target.closest('[class~="sticky"][class~="bottom-0"]');
      g = { x: t.clientX, y: t.clientY, lastY: t.clientY, lastT: e.timeStamp, v: 0, inHandle, scroller: scrollerOf(target, root), owner: null };
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!g || !t || g.owner === "content") return;
      if (g.owner === null) {
        g.owner = sheetGestureOwner({ open, dx: t.clientX - g.x, dy: t.clientY - g.y, inHandle: g.inHandle, scrollTop: g.scroller ? g.scroller.scrollTop : null });
        if (g.owner !== "sheet") return;
        g.y = t.clientY;
      }
      e.preventDefault();
      const dt = e.timeStamp - g.lastT;
      if (dt > 0) g.v = (t.clientY - g.lastY) / dt;
      g.lastY = t.clientY;
      g.lastT = e.timeStamp;
      const d = latest.current;
      d.onMove(sheetHeightWhileDragging(d.from, t.clientY - g.y, d.min, d.max));
    };
    const end = (cancelled: boolean) => () => {
      const done = g;
      g = null;
      if (done?.owner !== "sheet") return;
      const d = latest.current;
      d.onMove(null);
      if (!cancelled) rail.set(sheetSettles({ wasOpen: open, dy: done.lastY - done.y, velocity: done.v, span: d.max - d.min }));
    };
    const onEnd = end(false);
    const onCancel = end(true);
    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onCancel);
    return () => {
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchmove", move);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onCancel);
    };
  }, [ref, placement]);
}

function ChevronDown() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/** Folded: a grabber that opens the chat on tap. Open: a header to drag down, with a close button. */
function SheetHandle({ placement }: { placement: ChatPlacement }) {
  if (placement === "docked") {
    return (
      <button
        type="button"
        data-sheet-handle=""
        aria-label="Show chat"
        title="Show chat"
        onClick={() => rail.set(true)}
        style={{ height: GRABBER }}
        className="group flex w-full shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-border group-hover:bg-muted-foreground" />
      </button>
    );
  }
  return (
    <div data-sheet-handle="" style={{ height: SHEET_HEADER }} className="relative flex w-full shrink-0 items-center border-b border-border px-4">
      <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-border" />
      <span className="text-xs font-medium text-muted-foreground">Conversation</span>
      <button
        type="button"
        aria-label="Hide chat"
        title="Hide chat"
        onClick={() => rail.set(false)}
        className="-mr-2 ml-auto flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <ChevronDown />
      </button>
    </div>
  );
}

function Rail({ threadId, placement, pageWidth, pageHeight, focusRequest, onDockHeight }: { threadId: string; placement: ChatPlacement; pageWidth: number; pageHeight: number; focusRequest: number; onDockHeight: (h: number) => void }) {
  const sidebarTitle = experimental_useSidebarThreads().threads.find((thread) => thread.id === threadId)?.displayTitle;
  const sdk = useSdk();
  const [loadedTitle, setLoadedTitle] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (sidebarTitle) return;
    let cancelled = false;
    void sdk.threads.get({ threadId }).then((response) => {
      const result = response as { thread?: { title?: string }; title?: string };
      const title = result.thread?.title ?? result.title;
      if (!cancelled && typeof title === "string") setLoadedTitle({ id: threadId, title });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [threadId, sidebarTitle, sdk]);
  const title = sidebarTitle ?? (loadedTitle?.id === threadId ? loadedTitle.title : "Conversation");
  const [saved, setSaved] = useState(readWidth);
  const [dragging, setDragging] = useState<number | null>(null);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const composer = useDockedComposer(chatRef, placement === "docked");
  const width = clampRailWidth(dragging ?? saved, pageWidth);
  const dock = dockHeight(composer, pageHeight || 800);
  useLayoutEffect(() => onDockHeight(dock + GRABBER), [dock, onDockHeight]);
  const persist = (w: number) => {
    const next = clampRailWidth(w, pageWidth);
    setSaved(next);
    try {
      localStore()?.setItem(WIDTH_KEY, String(next));
    } catch {
      // Width just isn't remembered.
    }
  };
  const docked = dock + GRABBER;
  const open = Math.max(docked, (pageHeight || 800) - SHEET.topGap);
  useSheetTouch(asideRef, placement, { from: placement === "sheet" ? open : docked, min: docked, max: open, onMove: setSheetHeight });
  const style =
    placement === "rail" ? { width }
    : sheetHeight !== null ? { height: sheetHeight }
    : placement === "sheet" ? { height: `calc(100% - ${SHEET.topGap}px)` }
    : { height: `calc(${docked}px + env(safe-area-inset-bottom))` };
  return (
    <aside
      ref={asideRef}
      aria-label={`Chat: ${title}`}
      data-placement={placement}
      style={style}
      className={cx(
        "flex shrink-0 flex-col overflow-hidden bg-sidebar",
        dragging === null && sheetHeight === null && "motion-safe:transition-[width,height] motion-safe:duration-[240ms] motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]",
        placement === "rail" && "relative h-full border-l border-border",
        placement === "sheet" && "absolute inset-x-0 bottom-0 z-20 rounded-t-xl border-t border-border pb-[env(safe-area-inset-bottom)] shadow-xl",
        placement === "docked" && sheetHeight !== null && "z-20 rounded-t-xl shadow-xl",
        placement === "docked" && "absolute inset-x-0 bottom-0 z-10 border-t border-border pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {placement === "rail" && <ResizeHandle width={width} onDrag={setDragging} onDone={persist} />}
      {placement !== "rail" && <SheetHandle placement={placement} />}
      <div className="truncate border-b border-border px-4 py-2 text-xs text-muted-foreground" title={title}>{title}</div>
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

function View({ threadId, chatId }: { threadId: string; chatId: string }) {
  const openView = useOpenView();
  const [ref, pageWidth, pageHeight] = useElementSize<HTMLDivElement>();
  const mode = railMode(pageWidth || 1200);
  const openChat = useOpenChat();
  useLayoutEffect(() => { rail.place(`${threadId}:${mode}`, mode); if (chatId !== threadId) rail.set(true); }, [threadId, chatId, mode]);
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

  const revealComposer = useCallback(async () => {
    if (chatId !== threadId) openView(threadId, true);
    rail.set(true);
    setFocusRequest((n) => n + 1);
  }, [threadId, chatId, openView]);

  return (
    <div ref={ref} className="relative flex h-full min-h-0 w-full overflow-hidden bg-background">
      <div inert={placement === "sheet"} style={{ paddingBottom: placement === "docked" ? `calc(${dockSpace}px + env(safe-area-inset-bottom))` : 0 }} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <OrchestrationTab
          key={threadId}
          threadId={threadId}
          variant="page"
          openChild={(childId) => openView(threadId, false, childId)}
          revealComposer={revealComposer}
          questionAction={chatId === threadId ? "Answer" : "Show question"}
          noneAction={<Button variant="primary" onClick={() => openChat(threadId)}>Open chat</Button>}
        />
      </div>
      {placement === "sheet" && <button type="button" aria-label="Hide chat" tabIndex={-1} onClick={() => rail.set(false)} className="absolute inset-0 z-20 bg-background/40" />}
      <Rail key={chatId} threadId={chatId} placement={placement} pageWidth={pageWidth || 1200} pageHeight={pageHeight} focusRequest={focusRequest} onDockHeight={setDockSpace} />
    </div>
  );
}

export function OrchestratorPage({ subPath }: PluginNavPanelProps) {
  const threadId = threadFromSubPath(subPath);
  const requestedChat = chatFromSubPath(subPath);
  const owner = useOrchestrationOwner(requestedChat ?? "");
  const membership = useOrchestratorMembership(threadId ?? "");
  const openView = useOpenView();
  const navigate = useBbNavigate();
  useEffect(() => {
    if (!threadId || !requestedChat || requestedChat === threadId || owner === undefined || owner === threadId) return;
    if (owner) openView(owner, true, requestedChat);
    else navigate.toThread(requestedChat);
  }, [threadId, requestedChat, owner]);
  if (!threadId) return <Message title="Orchestration" body="Open an orchestrator's thread to see its team here." />;
  if (membership === false) return <NotHere threadId={threadId} />;
  if (membership === null) return <Message title="Reading the ledger" body="One moment." />;
  if (requestedChat !== threadId && owner !== threadId) return <Message title="Opening conversation" body="One moment." />;
  return <View key={threadId} threadId={threadId} chatId={requestedChat ?? threadId} />;
}
