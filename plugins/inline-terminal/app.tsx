import { useCallback, useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useSdk,
  type ExperimentalCodeFenceRendererProps,
} from "@get-bb/plugin-sdk/app";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  SHELL_LANGUAGES,
  commandFromFence,
  decodeBase64,
  encodeBase64,
  shellInput,
  terminalTitle,
} from "@/lib/command";

type Sdk = ReturnType<typeof useSdk>;
type RunState = "idle" | "starting" | "running" | "exited" | "error";

const ROWS = 14;
const POLL_FAST_MS = 60;
const POLL_IDLE_MAX_MS = 800;

/** Session ids survive the fence unmounting (scroll-out, reload) within this browser tab. */
const storageKey = (fenceKey: string) => `inline-terminal:${fenceKey}`;

/** Resolves any CSS color (oklch, var-based) to rgb() by painting it. */
function resolveColor(cssValue: string, fallback: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null || cssValue.trim() === "") return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = cssValue;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function themeFrom(element: HTMLElement): ITheme {
  const style = getComputedStyle(element);
  const foreground = resolveColor(style.color, "#eee");
  return {
    background: resolveColor(style.backgroundColor, "#111"),
    foreground,
    cursor: foreground,
    selectionBackground: "rgba(128, 128, 128, 0.35)",
  };
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function useInlineTerminal(sdk: Sdk, threadId: string, fenceKey: string) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(() =>
    sessionStorage.getItem(storageKey(fenceKey)),
  );
  const [state, setState] = useState<RunState>(terminalId === null ? "idle" : "starting");
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const remember = useCallback(
    (id: string | null) => {
      if (id === null) sessionStorage.removeItem(storageKey(fenceKey));
      else sessionStorage.setItem(storageKey(fenceKey), id);
      setTerminalId(id);
    },
    [fenceKey],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (terminalId === null || host === null) return;
    const term = new Terminal({
      rows: ROWS,
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      cursorBlink: true,
      scrollback: 5000,
      theme: themeFrom(host),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;

    let disposed = false;
    const abort = new AbortController();
    const inputSub = term.onData((data) => {
      void sdk.terminals.input({ terminalId, dataBase64: encodeBase64(data) }).catch(() => {});
    });

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const pushSize = () => {
      const size = fit.proposeDimensions();
      if (size === undefined || !Number.isFinite(size.cols) || size.cols < 2) return;
      term.resize(size.cols, ROWS);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        void sdk.terminals.resize({ terminalId, cols: term.cols, rows: term.rows }).catch(() => {});
      }, 120);
    };
    const observer = new ResizeObserver(pushSize);
    observer.observe(host);
    pushSize();

    void (async () => {
      let sinceSeq: number | undefined;
      let delay = POLL_FAST_MS;
      while (!disposed) {
        try {
          const out = await sdk.terminals.output({
            terminalId,
            ...(sinceSeq === undefined ? { tailBytes: 256 * 1024 } : { sinceSeq }),
            signal: abort.signal,
          });
          if (disposed) return;
          for (const chunk of out.chunks) term.write(decodeBase64(chunk.dataBase64));
          sinceSeq = out.nextSeq;
          if (out.status === "exited" || out.status === "disconnected") {
            setState("exited");
            setExitCode(out.exitCode);
            return;
          }
          setState("running");
          delay = out.chunks.length > 0 ? POLL_FAST_MS : Math.min(delay * 2, POLL_IDLE_MAX_MS);
        } catch (cause) {
          if (disposed) return;
          setState("error");
          setError(errorText(cause));
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    })();

    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(resizeTimer);
      observer.disconnect();
      inputSub.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, [sdk, terminalId]);

  const run = useCallback(
    async (command: string) => {
      setError(null);
      setExitCode(null);
      setState("starting");
      try {
        const session = await sdk.terminals.create({
          scope: { kind: "thread", threadId },
          start: { mode: "shell" },
          cols: 100,
          rows: ROWS,
          title: terminalTitle(command),
        });
        remember(session.id);
        await sdk.terminals.input({
          terminalId: session.id,
          dataBase64: encodeBase64(shellInput(command)),
        });
        termRef.current?.focus();
      } catch (cause) {
        setState("error");
        setError(errorText(cause));
      }
    },
    [sdk, threadId, remember],
  );

  const interrupt = useCallback(() => {
    if (terminalId === null) return;
    void sdk.terminals.input({ terminalId, dataBase64: encodeBase64("\x03") }).catch(() => {});
    termRef.current?.focus();
  }, [sdk, terminalId]);

  const close = useCallback(async () => {
    if (terminalId !== null) await sdk.terminals.close({ terminalId, mode: "force" }).catch(() => {});
    remember(null);
    setState("idle");
    setError(null);
  }, [sdk, terminalId, remember]);

  return { hostRef, termRef, terminalId, state, error, exitCode, run, interrupt, close };
}

const actionClass = "h-7 gap-1.5 px-2 text-xs";

function ShellFence({ code, language, status, index, message, Original }: ExperimentalCodeFenceRendererProps) {
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const command = commandFromFence(code);
  const term = useInlineTerminal(sdk, message.threadId, `${message.id}#${language}#${index}`);
  const ready = status !== "streaming" && command !== "";
  const live = term.state === "running" || term.state === "starting";
  const hasSession = term.terminalId !== null;

  return (
    <div className="my-2">
      <Original />
      <div className="-mt-1 flex flex-wrap items-center gap-1.5">
        {live ? null : (
          <Button
            size="sm"
            variant="outline"
            className={actionClass}
            disabled={!ready}
            aria-label={ready ? `Run in this thread shell: ${command}` : "Waiting for the block to finish"}
            onClick={() => void (hasSession ? term.close() : Promise.resolve()).then(() => term.run(command))}
          >
            <Icon name={hasSession ? "RotateCcw" : "Play"} className="size-3.5" />
            {hasSession ? "Run again" : "Run"}
          </Button>
        )}
        {hasSession && live ? (
          <>
            <Button size="sm" variant="ghost" className={actionClass} onClick={term.interrupt}>
              <Icon name="Square" className="size-3.5" />
              Ctrl-C
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={actionClass}
              aria-label="Show this session in the terminal panel"
              onClick={() => {
                if (term.terminalId !== null) void navigate.experimental_openTerminal({ terminalId: term.terminalId });
              }}
            >
              <Icon name="PanelRight" className="size-3.5" />
              Panel
            </Button>
          </>
        ) : null}
        {hasSession ? (
          <Button size="sm" variant="ghost" className={actionClass} onClick={() => void term.close()}>
            <Icon name="X" className="size-3.5" />
            Close
          </Button>
        ) : null}
        {term.state === "exited" ? (
          <span className="text-xs text-muted-foreground">
            Exited{term.exitCode === null ? "" : ` with code ${term.exitCode}`}
          </span>
        ) : null}
        {term.error !== null ? (
          <span role="alert" className="text-xs text-destructive">
            {term.error}
          </span>
        ) : null}
      </div>
      {hasSession ? (
        <div
          className="mt-1.5 overflow-hidden rounded-md border border-border bg-card p-1.5 text-card-foreground"
          onClick={() => term.termRef.current?.focus()}
        >
          <div ref={term.hostRef} className="w-full" />
        </div>
      ) : null}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_codeFenceRenderer({
    id: "shell",
    languages: SHELL_LANGUAGES,
    component: ShellFence,
  });
});
