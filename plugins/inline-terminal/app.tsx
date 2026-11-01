import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useSdk,
  useSettings,
  type ExperimentalCodeFenceRendererProps,
} from "@get-bb/plugin-sdk/app";
import { Terminal, type IMarker, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  EXIT_OSC,
  SHELL_LANGUAGES,
  commandFromFence,
  decodeBase64,
  encodeBase64,
  hashText,
  newNonce,
  parseWrapperOsc,
  resultMessage,
  terminalTitle,
  wrapperArgv,
} from "@/lib/command";

type Sdk = ReturnType<typeof useSdk>;
type RunState = "idle" | "starting" | "running" | "exited" | "error";
type Delivery = "sending" | "sent" | "manual" | "failed";
interface CommandResult {
  exitCode: number;
  output: string;
  delivery: Delivery;
}
interface RunRecord {
  command: string;
  nonce: string;
  reported: boolean;
  delivered: boolean;
}
interface QueuedResult {
  terminalId: string;
  command: string;
  exitCode: number;
  output: string;
}

const ROWS = 14;
const POLL_FAST_MS = 60;
const POLL_IDLE_MAX_MS = 250;

/** Storage lives per browser tab, so scrolling away or reloading reattaches instead of losing the session. */
const sessionKey = (fenceKey: string) => `inline-terminal:session:${fenceKey}`;
const runKey = (terminalId: string) => `inline-terminal:run:${terminalId}`;

function readRun(terminalId: string): RunRecord | null {
  const raw = sessionStorage.getItem(runKey(terminalId));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<RunRecord>;
    if (typeof value.command !== "string" || typeof value.nonce !== "string") return null;
    return { command: value.command, nonce: value.nonce, reported: value.reported === true, delivered: value.delivered === true };
  } catch {
    return null;
  }
}

function updateRun(terminalId: string, patch: Partial<RunRecord>): void {
  const current = readRun(terminalId);
  if (current !== null) sessionStorage.setItem(runKey(terminalId), JSON.stringify({ ...current, ...patch }));
}

/** Fences the host gives the same id and index (seen within one agent turn) each get their own slot. */
const claimedFenceKeys = new Set<string>();
function useClaimedFenceKey(baseKey: string | null): string | null {
  const [claimed, setClaimed] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (baseKey === null) {
      setClaimed(null);
      return;
    }
    let slot = 0;
    while (claimedFenceKeys.has(`${baseKey}#${slot}`)) slot += 1;
    const key = `${baseKey}#${slot}`;
    claimedFenceKeys.add(key);
    setClaimed(key);
    return () => {
      claimedFenceKeys.delete(key);
    };
  }, [baseKey]);
  return claimed;
}

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

/** Rendered text from `fromLine` to the cursor, with wrapped rows rejoined. */
function bufferText(term: Terminal, fromLine: number): string {
  const buffer = term.buffer.active;
  const lastLine = buffer.baseY + buffer.cursorY;
  let text = "";
  for (let y = Math.max(0, fromLine); y <= lastLine; y += 1) {
    const line = buffer.getLine(y);
    if (line === undefined) continue;
    const separator = y === fromLine || line.isWrapped ? "" : "\n";
    text += separator + line.translateToString(true);
  }
  return text;
}

function useInlineTerminal(sdk: Sdk, threadId: string, fenceKey: string | null, autoSend: boolean | undefined) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const storedSession = (key: string | null) => (key === null ? null : sessionStorage.getItem(sessionKey(key)));
  const [boundKey, setBoundKey] = useState(fenceKey);
  const [terminalId, setTerminalId] = useState<string | null>(() => storedSession(fenceKey));
  const [state, setState] = useState<RunState>(terminalId === null ? "idle" : "starting");
  const [error, setError] = useState<string | null>(null);
  const [shellExitCode, setShellExitCode] = useState<number | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);

  if (boundKey !== fenceKey) {
    const stored = storedSession(fenceKey);
    setBoundKey(fenceKey);
    setTerminalId(stored);
    setState(stored === null ? "idle" : "starting");
    setShellExitCode(null);
    setResult(null);
    setError(null);
  }

  const remember = useCallback(
    (id: string | null) => {
      if (fenceKey !== null) {
        if (id === null) sessionStorage.removeItem(sessionKey(fenceKey));
        else sessionStorage.setItem(sessionKey(fenceKey), id);
      }
      setTerminalId(id);
    },
    [fenceKey],
  );

  const deliver = useCallback(
    async ({ terminalId: id, command, exitCode, output }: QueuedResult) => {
      setError(null);
      setResult({ exitCode, output, delivery: "sending" });
      try {
        await sdk.threads.send({
          threadId,
          mode: "queue-if-active",
          input: [
            { type: "text", text: resultMessage(command, exitCode, output), mentions: [], visibility: "agent-only" },
          ],
        });
        updateRun(id, { delivered: true });
        setResult({ exitCode, output, delivery: "sent" });
      } catch (cause) {
        setResult({ exitCode, output, delivery: "failed" });
        setError(`Could not send the result: ${errorText(cause)}`);
      }
    },
    [sdk, threadId],
  );

  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;
  const deliverRef = useRef(deliver);
  deliverRef.current = deliver;
  const awaitingSettingsRef = useRef<QueuedResult | null>(null);

  useEffect(() => {
    const queued = awaitingSettingsRef.current;
    if (queued === null || autoSend === undefined) return;
    awaitingSettingsRef.current = null;
    if (autoSend) void deliver(queued);
  }, [autoSend, deliver]);

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
    if (readRun(terminalId)?.reported === false) term.focus();

    let outputStart: IMarker | undefined;
    const oscSub = term.parser.registerOscHandler(EXIT_OSC, (data) => {
      const run = readRun(terminalId);
      const signal = run === null ? null : parseWrapperOsc(data, run.nonce);
      if (run === null || signal === null) return false;
      if (signal.kind === "start") {
        outputStart?.dispose();
        outputStart = term.registerMarker(0);
        return true;
      }
      const fromLine = outputStart !== undefined && !outputStart.isDisposed ? outputStart.line : 0;
      const finished: QueuedResult = { terminalId, command: run.command, exitCode: signal.code, output: bufferText(term, fromLine) };
      if (run.reported) {
        setResult((current) => current ?? { ...finished, delivery: run.delivered ? "sent" : "manual" });
        return true;
      }
      updateRun(terminalId, { reported: true });
      if (autoSendRef.current === true) void deliverRef.current(finished);
      else {
        if (autoSendRef.current === undefined) awaitingSettingsRef.current = finished;
        setResult({ ...finished, delivery: "manual" });
      }
      return true;
    });

    let disposed = false;
    const abort = new AbortController();
    let wakePoll: (() => void) | null = null;
    const inputSub = term.onData((data) => {
      void sdk.terminals
        .input({ terminalId, dataBase64: encodeBase64(data) })
        .catch(() => {})
        .then(() => wakePoll?.());
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
        let woken = false;
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
            setShellExitCode(out.exitCode);
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
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          wakePoll = () => {
            woken = true;
            clearTimeout(timer);
            resolve();
          };
        });
        wakePoll = null;
        if (woken) delay = POLL_FAST_MS;
      }
    })();

    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(resizeTimer);
      observer.disconnect();
      oscSub.dispose();
      inputSub.dispose();
      outputStart?.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, [sdk, terminalId]);

  const run = useCallback(
    async (command: string) => {
      setError(null);
      setShellExitCode(null);
      setResult(null);
      setState("starting");
      const nonce = newNonce();
      try {
        const session = await sdk.terminals.create({
          scope: { kind: "thread", threadId },
          start: { mode: "argv", argv: wrapperArgv(command, nonce) },
          cols: 100,
          rows: ROWS,
          title: terminalTitle(command),
        });
        const record: RunRecord = { command, nonce, reported: false, delivered: false };
        sessionStorage.setItem(runKey(session.id), JSON.stringify(record));
        remember(session.id);
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
    if (terminalId !== null) {
      sessionStorage.removeItem(runKey(terminalId));
      await sdk.terminals.close({ terminalId, mode: "force" }).catch(() => {});
    }
    awaitingSettingsRef.current = null;
    remember(null);
    setState("idle");
    setError(null);
    setResult(null);
  }, [sdk, terminalId, remember]);

  const resend = useCallback(() => {
    const run = terminalId === null ? null : readRun(terminalId);
    if (terminalId === null || run === null || result === null) return;
    void deliver({ terminalId, command: run.command, exitCode: result.exitCode, output: result.output });
  }, [terminalId, result, deliver]);

  return { hostRef, termRef, terminalId, state, error, shellExitCode, result, run, interrupt, close, resend };
}

const actionClass = "h-7 gap-1.5 px-2 text-xs";

function ResultBadge({ result, onSend }: { result: CommandResult; onSend: () => void }) {
  return (
    <>
      <span className={result.exitCode === 0 ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
        exit {result.exitCode}
      </span>
      {result.delivery === "sending" ? (
        <span className="text-xs text-muted-foreground">Sending to agent…</span>
      ) : result.delivery === "sent" ? (
        <span className="text-xs text-muted-foreground">Sent to agent</span>
      ) : (
        <Button size="sm" variant="ghost" className={actionClass} onClick={onSend}>
          <Icon name="Send" className="size-3.5" />
          Send to agent
        </Button>
      )}
    </>
  );
}

function ShellFence({ code, language, status, index, message, Original }: ExperimentalCodeFenceRendererProps) {
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const settings = useSettings();
  const autoSend = settings.values === undefined ? undefined : settings.values.autoSendResult !== false;
  const command = commandFromFence(code);
  const ready = status !== "streaming" && command !== "";
  const baseKey = ready ? `${message.threadId}#${message.id}#${language}#${index}#${hashText(command)}` : null;
  const fenceKey = useClaimedFenceKey(baseKey);
  const term = useInlineTerminal(sdk, message.threadId, fenceKey, autoSend);
  const live = term.state === "running" || term.state === "starting";
  const hasSession = term.terminalId !== null;

  return (
    <div className="my-2" data-inline-terminal-fence={fenceKey ?? ""}>
      <Original />
      <div className="-mt-1 flex flex-wrap items-center gap-1.5">
        {live ? null : (
          <Button
            size="sm"
            variant="outline"
            className={actionClass}
            disabled={!ready || fenceKey === null}
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
        {term.result !== null ? <ResultBadge result={term.result} onSend={term.resend} /> : null}
        {term.state === "exited" && term.result === null ? (
          <span className="text-xs text-muted-foreground">
            Shell exited{term.shellExitCode === null ? "" : ` with code ${term.shellExitCode}`}
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
