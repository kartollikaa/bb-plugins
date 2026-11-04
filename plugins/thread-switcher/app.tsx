import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  definePluginApp,
  experimental_usePluginId as usePluginId,
  experimental_useSidebarThreads as useSidebarThreads,
  useBbContext,
  useBbNavigate,
  useRpc,
  useSdk,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server.ts";
import {
  countTotal,
  DOT_LABEL,
  subthreadCounts,
  threadDotState,
  threadUrgency,
  type DotState,
  type StateCounts,
} from "./lib/status.ts";
import {
  DEFAULT_HOTKEY,
  formatHotkey,
  hotkeyFromEvent,
  hotkeyModifierReleased,
  matchHotkey,
  parseHotkey,
  type Hotkey,
} from "./lib/hotkey.ts";
import {
  clampThreadCount,
  EMPTY_PREVIEW,
  formatAge,
  initialIndex,
  orderThreads,
  parseRecent,
  previewFromTimeline,
  recordVisit,
  stepIndex,
  type ThreadPreview,
} from "./lib/switcher.ts";
import { MAX_FREE_SCALE, PinchTracker, type Point } from "./lib/pinch.ts";

const PREFETCH_DEBOUNCE_MS = 800;
const CARDS_PER_ROW = 6;
const recorder = { active: false };

type SidebarThread = ReturnType<typeof useSidebarThreads>["threads"][number];

function useHotkey(): Hotkey {
  const { values } = useSettings();
  const raw = typeof values?.hotkey === "string" ? values.hotkey : DEFAULT_HOTKEY;
  return useMemo(() => parseHotkey(raw) ?? parseHotkey(DEFAULT_HOTKEY)!, [raw]);
}

function useThreadCount(): number {
  const { values } = useSettings();
  return clampThreadCount(values?.threadCount);
}

function useAttentionFirst(): boolean {
  const { values } = useSettings();
  return values?.attentionFirst !== false;
}

function usePinchToOpen(): boolean {
  const { values } = useSettings();
  return values?.pinchToOpen !== false;
}

function useRecentThreads(currentId: string | null): string[] {
  const storageKey = `${usePluginId()}:recent`;
  const [recent, setRecent] = useState(() => parseRecent(localStorage.getItem(storageKey)));
  useEffect(() => {
    if (!currentId) return;
    setRecent((previous) => {
      if (previous[0] === currentId) return previous;
      const next = recordVisit(previous, currentId);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [currentId, storageKey]);
  return recent;
}

/** `row` follows the held hotkey; `grid` is the touch layout a pinch opens. */
type SwitcherLayout = "row" | "grid";

interface SwitcherState {
  threads: SidebarThread[];
  index: number;
  layout: SwitcherLayout;
}

function touchPoints(event: TouchEvent): Point[] {
  return Array.from(event.touches, (touch) => ({ x: touch.clientX, y: touch.clientY }));
}

function usePrefetchPreviews(threads: readonly SidebarThread[]) {
  const sdk = useSdk();
  const key = threads.map((thread) => `${thread.id}:${thread.updatedAt}`).join(",");
  const latestThreads = useRef(threads);
  latestThreads.current = threads;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const thread of latestThreads.current) void loadPreview(sdk, thread.id, thread.updatedAt);
    }, PREFETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [sdk, key]);
}

function ThreadSwitcher() {
  const hotkey = useHotkey();
  const { threads, projects } = useSidebarThreads();
  const subthreads = useMemo(() => subthreadCounts(threads), [threads]);
  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const { threadId: currentId } = useBbContext();
  const recent = useRecentThreads(currentId);
  const count = useThreadCount();
  const attentionFirst = useAttentionFirst();
  const pinchToOpen = usePinchToOpen();
  const navigate = useBbNavigate();
  const [state, setState] = useState<SwitcherState | null>(null);
  const candidates = useMemo(
    () => orderThreads(threads, recent, currentId, count, attentionFirst ? threadUrgency : undefined),
    [threads, recent, currentId, count, attentionFirst],
  );
  usePrefetchPreviews(candidates);

  const latest = useRef({ hotkey, candidates, currentId, state, navigate });
  latest.current = { hotkey, candidates, currentId, state, navigate };

  const close = useCallback((commit: boolean) => {
    const { state: current, currentId: activeId, navigate: nav } = latest.current;
    setState(null);
    if (!commit || !current) return;
    const target = current.threads[current.index];
    if (target && target.id !== activeId) nav.toThread(target.id);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const swallow = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener(
      "keydown",
      (event) => {
        if (recorder.active || event.isComposing) return;
        const { hotkey: keys, candidates: list, currentId: activeId, state: current } = latest.current;
        const direction = matchHotkey(event, keys);
        if (direction) {
          swallow(event);
          if (!current) {
            if (list.length < 2) return;
            const hasCurrent = list[0]?.id === activeId;
            setState({ threads: list, index: initialIndex(direction, list.length, hasCurrent), layout: "row" });
          } else {
            const delta = direction === "forward" ? 1 : -1;
            setState({ ...current, index: stepIndex(current.index, delta, current.threads.length) });
          }
          return;
        }
        if (!current) return;
        if (event.key === "Escape") {
          swallow(event);
          close(false);
        } else if (event.key === "Enter") {
          swallow(event);
          close(true);
        } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          swallow(event);
          setState({ ...current, index: stepIndex(current.index, 1, current.threads.length) });
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          swallow(event);
          setState({ ...current, index: stepIndex(current.index, -1, current.threads.length) });
        }
      },
      { capture: true, signal: controller.signal },
    );

    window.addEventListener(
      "keyup",
      (event) => {
        const { hotkey: keys, state: current } = latest.current;
        if (current?.layout === "row" && hotkeyModifierReleased(event, keys)) close(true);
      },
      { capture: true, signal: controller.signal },
    );

    window.addEventListener("blur", () => close(false), { signal: controller.signal });
    return () => controller.abort();
  }, [close]);

  useEffect(() => {
    if (!pinchToOpen) return;
    const controller = new AbortController();
    const tracker = new PinchTracker();
    const follow = (event: TouchEvent) => tracker.touch(touchPoints(event));
    const options = { passive: true, signal: controller.signal };
    window.addEventListener("touchstart", follow, options);
    window.addEventListener("touchend", follow, options);
    window.addEventListener("touchcancel", follow, options);
    window.addEventListener(
      "touchmove",
      (event) => {
        if (tracker.move(touchPoints(event)) !== "in") return;
        const { candidates: list, state: current } = latest.current;
        const zoomedIn = (window.visualViewport?.scale ?? 1) > MAX_FREE_SCALE;
        if (current || event.defaultPrevented || zoomedIn || list.length < 2) return;
        setState({ threads: list, index: 0, layout: "grid" });
      },
      options,
    );
    return () => controller.abort();
  }, [pinchToOpen]);

  if (!state) return null;

  if (state.layout === "grid") {
    return (
      <TouchSwitcher
        threads={state.threads}
        currentId={currentId}
        projectNames={projectNames}
        subthreads={subthreads}
        onClose={() => close(false)}
        onPick={(index) => {
          latest.current.state = { ...state, index };
          close(true);
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close(false);
      }}
    >
      <div
        role="listbox"
        aria-label="Switch thread"
        style={{ gridTemplateColumns: `repeat(${Math.min(state.threads.length, CARDS_PER_ROW)}, minmax(0, 13rem))` }}
        className="grid max-w-[94vw] justify-center gap-2 rounded-2xl border border-border bg-popover/90 p-3 shadow-2xl backdrop-blur-xl"
      >
        {state.threads.map((thread, index) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            projectName={projectNames.get(thread.projectId) ?? null}
            subthreads={subthreads.get(thread.id) ?? null}
            age={formatAge(thread.updatedAt, Date.now())}
            selected={index === state.index}
            onHover={() => setState((current) => (current ? { ...current, index } : current))}
            onPick={() => {
              latest.current.state = { ...state, index };
              close(true);
            }}
          />
        ))}
      </div>
    </div>
  );
}

const ENTER_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Fades in from slightly larger, as if the open chat shrank into its card. */
function useZoomOutEntrance(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element?.animate) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.animate(
      reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "scale(1.12)" },
            { opacity: 1, transform: "scale(1)" },
          ],
      { duration: reduced ? 150 : 260, easing: ENTER_EASING },
    );
  }, [ref]);
}

/** Spreading two fingers over the grid closes it, the reverse of the pinch that opened it, instead of zooming the page. */
function useSpreadToClose(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const controller = new AbortController();
    const tracker = new PinchTracker();
    const follow = (event: TouchEvent) => tracker.touch(touchPoints(event));
    const passive = { passive: true, signal: controller.signal };
    element.addEventListener("touchstart", follow, passive);
    element.addEventListener("touchend", follow, passive);
    element.addEventListener("touchcancel", follow, passive);
    element.addEventListener(
      "touchmove",
      (event) => {
        if (event.touches.length > 1) event.preventDefault();
        if (tracker.move(touchPoints(event)) === "out") latestClose.current();
      },
      { passive: false, signal: controller.signal },
    );
    // Safari zooms on its own gesture events even when touchmove is cancelled.
    for (const type of ["gesturestart", "gesturechange"]) {
      element.addEventListener(type, (event) => event.preventDefault(), { passive: false, signal: controller.signal });
    }
    return () => controller.abort();
  }, [ref]);
}

function TouchSwitcher({
  threads,
  currentId,
  projectNames,
  subthreads,
  onClose,
  onPick,
}: {
  threads: readonly SidebarThread[];
  currentId: string | null;
  projectNames: ReadonlyMap<string, string>;
  subthreads: ReadonlyMap<string, StateCounts>;
  onClose: () => void;
  onPick: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useZoomOutEntrance(ref);
  useSpreadToClose(ref, onClose);
  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[2147483000] flex flex-col bg-background/80 backdrop-blur-xl"
      style={{
        touchAction: "pan-y",
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
        <span className="text-base font-semibold text-foreground">Recent threads</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-9 items-center justify-center rounded-full bg-muted text-foreground active:bg-accent"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div
        role="listbox"
        aria-label="Switch thread"
        className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3 gap-y-4 overflow-y-auto overscroll-contain px-3 pt-1 sm:grid-cols-3"
        style={{ touchAction: "pan-y", paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {threads.map((thread, index) => (
          <ThreadCard
            key={thread.id}
            variant="grid"
            thread={thread}
            projectName={projectNames.get(thread.projectId) ?? null}
            subthreads={subthreads.get(thread.id) ?? null}
            age={formatAge(thread.updatedAt, Date.now())}
            selected={thread.id === currentId}
            onPick={() => onPick(index)}
          />
        ))}
      </div>
    </div>
  );
}

function ThreadCard({
  variant = "row",
  thread,
  projectName,
  subthreads,
  age,
  selected,
  onHover,
  onPick,
}: {
  variant?: SwitcherLayout;
  thread: SidebarThread;
  projectName: string | null;
  subthreads: StateCounts | null;
  age: string;
  selected: boolean;
  onHover?: () => void;
  onPick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dot = threadDotState(thread);
  const needsInput = dot === "input";
  const grid = variant === "grid";
  useEffect(() => {
    if (selected && !grid) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected, grid]);

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      aria-description={DOT_LABEL[dot]}
      onMouseMove={selected || grid ? undefined : onHover}
      onMouseDown={
        grid
          ? undefined
          : (event) => {
              event.preventDefault();
              onPick();
            }
      }
      onClick={grid ? onPick : undefined}
      className={`flex min-w-0 cursor-default select-none flex-col gap-1.5 rounded-xl p-1.5 ${
        grid ? "transition-[background-color,transform] active:scale-[0.97]" : "transition-colors"
      } ${selected ? "bg-accent" : ""}`}
    >
      <div
        className={`${grid ? "aspect-[3/4]" : "aspect-[3/2]"} overflow-hidden rounded-lg border bg-background shadow-sm ${
          needsInput ? "border-attention ring-2 ring-attention/50" : selected ? "border-ring" : "border-border"
        }`}
      >
        <ChatPreview threadId={thread.id} version={thread.updatedAt} dot={dot} subthreads={subthreads} />
      </div>
      <div className="flex min-w-0 gap-1.5 px-0.5" title={thread.displayTitle}>
        <span className="flex h-4 w-3.5 shrink-0 items-center justify-center" title={DOT_LABEL[dot]}>
          <StatusDot state={dot} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 h-8 break-words text-xs font-medium leading-4 text-foreground">
            {thread.displayTitle}
          </span>
          <span className="flex min-w-0 gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <span className="min-w-0 flex-1 truncate font-medium text-foreground/70">{projectName ?? "No project"}</span>
            <span className="shrink-0 tabular-nums">{age}</span>
          </span>
          <span className="truncate font-mono text-[10px] leading-4 text-muted-foreground/80">
            {thread.environment?.branchName ?? "\u00a0"}
          </span>
        </div>
      </div>
    </div>
  );
}

// bb's theme has no blue status token, so running uses Tailwind's palette, as thread-tree does.
const DOT_CLASS: Record<DotState, string> = {
  running: "bg-blue-500 animate-pulse",
  input: "bg-attention",
  error: "bg-destructive",
  done: "bg-success",
};

function StatusDot({ state, className = "size-2" }: { state: DotState; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${className} ${DOT_CLASS[state]}`} />;
}

type Sdk = ReturnType<typeof useSdk>;
type CachedPreview = { version: number; preview: ThreadPreview };

const previewCache = new Map<string, CachedPreview>();
const inflight = new Map<string, Promise<void>>();
const previewListeners = new Set<() => void>();

function loadPreview(sdk: Sdk, threadId: string, version: number, fresh = false): Promise<void> {
  const cached = previewCache.get(threadId);
  if (!fresh && cached && cached.version >= version) return Promise.resolve();
  const key = `${threadId}:${version}:${fresh}`;
  const running = inflight.get(key);
  if (running) return running;
  const request = sdk.threads
    .timeline({ threadId, segmentLimit: "4" })
    .then((timeline) => previewFromTimeline(timeline))
    .catch(() => cached?.preview ?? EMPTY_PREVIEW)
    .then((preview) => {
      previewCache.set(threadId, { version, preview });
      previewListeners.forEach((listener) => listener());
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** Shows the last known preview at once and swaps in a fresh one when it arrives. */
function usePreview(threadId: string, version: number, fresh: boolean): ThreadPreview | null {
  const sdk = useSdk();
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((value) => value + 1);
    previewListeners.add(listener);
    void loadPreview(sdk, threadId, version, fresh);
    return () => {
      previewListeners.delete(listener);
    };
  }, [sdk, threadId, version, fresh]);
  return previewCache.get(threadId)?.preview ?? null;
}

function ChatPreview({
  threadId,
  version,
  dot,
  subthreads,
}: {
  threadId: string;
  version: number;
  dot: DotState;
  subthreads: StateCounts | null;
}) {
  const preview = usePreview(threadId, version, dot === "running");
  if (preview === null) {
    return <div className="h-full animate-pulse bg-muted/40" />;
  }
  const recap = subthreads
    ? { noun: "subthread", counts: subthreads }
    : countTotal(preview.subagents) > 0
      ? { noun: "subagent", counts: preview.subagents }
      : null;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <PreviewBody preview={preview} needsInput={dot === "input"} />
      </div>
      {recap && <RecapLine noun={recap.noun} counts={recap.counts} />}
    </div>
  );
}

const RECAP_STATES: readonly { state: DotState; label: string }[] = [
  { state: "input", label: "needs input" },
  { state: "error", label: "failed" },
  { state: "running", label: "running" },
  { state: "done", label: "done" },
];

function RecapLine({ noun, counts }: { noun: string; counts: StateCounts }) {
  const total = countTotal(counts);
  const parts = RECAP_STATES.filter(({ state }) => counts[state] > 0);
  const shown = parts.filter(({ state }) => state !== "done");
  const summary = `${total} ${noun}${total === 1 ? "" : "s"}`;
  return (
    <div
      title={[summary, ...parts.map(({ state, label }) => `${counts[state]} ${label}`)].join(", ")}
      className="flex shrink-0 items-center gap-1.5 overflow-hidden px-1.5 pb-1.5 pt-1 text-[10px] leading-tight tabular-nums text-muted-foreground"
    >
      <span className="shrink-0">{shown.length === 0 ? `${summary}, all done` : summary}</span>
      {shown.map(({ state, label }) => (
        <span key={state} className="flex shrink-0 items-center gap-0.5">
          <StatusDot state={state} className="size-1.5 animate-none" />
          {counts[state]} {label}
        </span>
      ))}
    </div>
  );
}

function PreviewBody({ preview, needsInput }: { preview: ThreadPreview; needsInput: boolean }) {
  if (needsInput && preview.pending) {
    return (
      <div className="flex h-full flex-col gap-1 overflow-hidden bg-attention/10 p-2">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-attention">Waiting for you</span>
        <span className="line-clamp-[7] whitespace-pre-line break-words text-[9.5px] leading-[1.35] text-foreground">
          {preview.pending}
        </span>
      </div>
    );
  }
  const { messages } = preview;
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
        No messages yet
      </div>
    );
  }
  return (
    <div
      className="flex h-full flex-col justify-end gap-1.5 overflow-hidden p-2 text-[8.5px] leading-[1.35]"
      style={{ maskImage: "linear-gradient(to bottom, transparent, black 28%)" }}
    >
      {messages.map((message) =>
        message.role === "user" ? (
          <div
            key={message.id}
            className="ml-6 shrink-0 self-end whitespace-pre-line break-words rounded-md bg-muted px-1.5 py-1 text-foreground line-clamp-4"
          >
            {message.text}
          </div>
        ) : (
          <div
            key={message.id}
            className="shrink-0 whitespace-pre-line break-words text-foreground/80 line-clamp-[8]"
          >
            {message.text}
          </div>
        ),
      )}
    </div>
  );
}

const KEY_SYMBOLS: [keyof Omit<Hotkey, "key">, string][] = [
  ["ctrl", "⌃"],
  ["alt", "⌥"],
  ["shift", "⇧"],
  ["meta", "⌘"],
];

const KEY_LABELS: Record<string, string> = {
  Tab: "⇥",
  Space: "Space",
  Enter: "↩",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

function HotkeyKeys({ hotkey }: { hotkey: Hotkey }) {
  const keys = [
    ...KEY_SYMBOLS.filter(([modifier]) => hotkey[modifier]).map(([, symbol]) => symbol),
    KEY_LABELS[hotkey.key] ?? hotkey.key,
  ];
  return (
    <span className="inline-flex gap-1" aria-label={formatHotkey(hotkey)}>
      {keys.map((key, index) => (
        <kbd
          key={index}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-sans text-xs text-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function HotkeySettings() {
  const hotkey = useHotkey();
  const rpc = useRpc<typeof rpcContract>();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (next: Hotkey) => {
      setError(null);
      try {
        await rpc.call("setHotkey", { hotkey: formatHotkey(next) });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [rpc],
  );

  useEffect(() => {
    if (!recording) return;
    recorder.active = true;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      const next = hotkeyFromEvent(event);
      if (!next) return;
      setRecording(false);
      void save(next);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      recorder.active = false;
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [recording, save]);

  const isDefault = formatHotkey(hotkey) === formatHotkey(parseHotkey(DEFAULT_HOTKEY)!);
  const buttonClass =
    "inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <span className="text-sm text-muted-foreground">Press the new shortcut… (Esc to cancel)</span>
        ) : (
          <HotkeyKeys hotkey={hotkey} />
        )}
        <button type="button" className={buttonClass} onClick={() => setRecording((value) => !value)}>
          {recording ? "Cancel" : "Record shortcut"}
        </button>
        {!isDefault && !recording && (
          <button type="button" className={buttonClass} onClick={() => void save(parseHotkey(DEFAULT_HOTKEY)!)}>
            Reset to ⌃⇥
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        The shortcut needs Control, Option or Command. Hold it to keep the switcher open, press the key again
        to move on, add Shift to go back, and let go to open the selected thread.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "switcher", component: ThreadSwitcher });
  app.slots.settingsSection({ id: "hotkey", title: "Shortcut", component: HotkeySettings });
});
