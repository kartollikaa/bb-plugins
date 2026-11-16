import type { ReactNode } from "react";
import { Markdown, ThreadChat, experimental_useRpcQuery as useRpcQuery } from "@get-bb/plugin-sdk/app";
import { rpcContract } from "../lib/contract.ts";
import type { Part, PartState, Progress } from "../lib/progress.ts";

const FENCE = [
  "```ui",
  'Card("Fence in plugin Markdown", [Progress(6, max: 7, label: "Parts done", tone: "good")])',
  "```",
].join("\n");

const STATE_COLOR: Record<PartState, string> = {
  done: "bg-success",
  running: "bg-primary",
  waiting: "bg-warning",
  "not-started": "bg-muted-foreground/30",
};

const WORD_COLOR: Record<Progress["stateWord"], string> = {
  "Needs you": "bg-warning",
  Blocked: "bg-destructive",
  "In progress": "bg-primary",
  Waiting: "bg-muted-foreground",
  Done: "bg-success",
  Planning: "bg-muted-foreground",
};

function Section({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <section data-probe={id} className="space-y-2">
      <h2 className="m-0 text-sm font-semibold">{title}</h2>
      <p className="m-0 text-xs text-muted-foreground">{note}</p>
      <div className="rounded-lg border border-border p-3">{children}</div>
    </section>
  );
}

function Segments({ parts, thin }: { parts: Part[]; thin?: boolean }) {
  return (
    <div className={`flex w-full gap-0.5 ${thin ? "h-1.5" : "h-2"}`} role="img" aria-label={`${parts.filter((p) => p.state === "done").length} of ${parts.length} parts done`}>
      {parts.map((part, i) => (
        <span key={i} title={`${part.name}: ${part.word}`} className={`flex-1 rounded-sm ${STATE_COLOR[part.state]}`} />
      ))}
    </div>
  );
}

function Glyph({ state }: { state: PartState }) {
  const text = { done: "✓", running: "●", waiting: "◐", "not-started": "○" }[state];
  const color = { done: "text-success", running: "text-primary", waiting: "text-warning-text", "not-started": "text-muted-foreground" }[state];
  return <span aria-hidden className={`w-4 shrink-0 text-center ${color}`}>{text}</span>;
}

export function HeaderStrip({ progress }: { progress: Progress }) {
  return (
    <div data-probe-native="header" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <span className={`size-2 rounded-full ${WORD_COLOR[progress.stateWord]}`} />
        {progress.stateWord}
      </span>
      <span className="min-w-0 truncate text-muted-foreground">{progress.sentence}</span>
      <span className="ml-auto flex w-40 items-center gap-2">
        <Segments parts={progress.parts} thin />
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {progress.done}/{progress.total}
        </span>
      </span>
    </div>
  );
}

export function NowCard({ progress }: { progress: Progress }) {
  return (
    <div data-probe-native="card" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-base font-semibold">
          <span className={`size-2.5 rounded-full ${WORD_COLOR[progress.stateWord]}`} />
          {progress.stateWord}
          <span className="font-normal text-muted-foreground">· {progress.sentence}</span>
        </span>
        <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
          {progress.done} of {progress.total} parts done
        </span>
      </div>
      <Segments parts={progress.parts} />
      {progress.asks.map((ask, i) => (
        <div key={i} className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <span className="font-medium">Needs you: </span>
          {ask}
        </div>
      ))}
      <ol className="m-0 list-none space-y-1 p-0 text-sm">
        {progress.parts.map((part, i) => (
          <li key={i} className="flex items-center gap-2">
            <Glyph state={part.state} />
            <span className="min-w-0 flex-1 truncate">{part.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{part.word}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ProbePage() {
  const { data, error, isLoading } = useRpcQuery({ contract: rpcContract, method: "probe", input: null});
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-3xl space-y-6 px-4 py-4">
        <h1 className="m-0 text-lg font-semibold">GenUI probe</h1>
        {error ? <p className="text-destructive">{String(error)}</p> : null}
        {isLoading || !data ? <p className="text-muted-foreground">Reading the ledger…</p> : null}
        <Section id="markdown-fence" title="1. SDK Markdown with a ```ui fence" note="Host Markdown in a plugin view; genui is installed and running.">
          <Markdown content={FENCE} />
        </Section>
        <Section id="threadchat" title="2. ThreadChat (timeline) of a thread whose reply holds a ```ui block" note={data?.chatThreadId ?? "chatThreadId setting is empty"}>
          {data?.chatThreadId ? (
            <div className="h-[560px]">
              <ThreadChat threadId={data.chatThreadId} variant="timeline" layout="contained" className="h-full" />
            </div>
          ) : null}
        </Section>
        {data ? (
          <>
            <Section id="native-header" title="3a. Native header strip, read from the ledger on open" note={`read ${data.readAt}`}>
              <HeaderStrip progress={data.progress} />
            </Section>
            <Section id="native-card" title="3b. Native Now card, read from the ledger on open" note={`read ${data.readAt}`}>
              <NowCard progress={data.progress} />
            </Section>
          </>
        ) : null}
      </div>
    </div>
  );
}
