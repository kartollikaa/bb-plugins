import { useState, type ReactNode } from "react";
import type { NowView, NowWait } from "./view.ts";

const MAX_WAITS = 5;

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Workspace = { rootPath: string; hostId: string; ledgerHostId: string | null } | null;

export interface NowBlockProps {
  now: NowView;
  variant: "tab" | "page";
  ledgerPath: string;
  report: { text: string; truncated: boolean } | null;
  workspace: Workspace;
  threadIds: Record<string, string>;
  openThread(threadId: string | null): void;
  renderEvidence(content: string, sourcePath: string, hostId: string | null): ReactNode;
}

export function nowBlockHidden(now: NowView): boolean {
  return now.source === "none" && now.orchestrator.state === "unknown" && !now.lastDecision && !now.lastTurn;
}

function orchestratorLine(now: NowView): string {
  const { state, age, activity, background } = now.orchestrator;
  const tail = background > 0 ? ` · ${background} in the background` : "";
  if (state === "unknown") return "Orchestrator · not in bb's thread list";
  if (state === "asking") return `Orchestrator · asking you${age ? ` · ${age}` : ""}${tail}`;
  if (state === "running") return `Orchestrator · running${age ? ` ${age}` : ""}${activity ? ` · ${activity}` : ""}${tail}`;
  return `Orchestrator · idle${age ? ` since ${age}` : ""}${tail}`;
}

function Line({ label, children, muted }: { label: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className={cx("grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2", muted && "text-muted-foreground")}>
      <dt className="text-subtle-foreground">{label}</dt>
      <dd className="m-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function WaitRow({ wait, threadIds, openThread }: { wait: NowWait; threadIds: Record<string, string>; openThread(id: string | null): void }) {
  const target = wait.subtask ? threadIds[wait.subtask] ?? null : null;
  const body = <><span className="tabular-nums">{wait.label}</span> · {wait.what}{wait.age && <span className="text-subtle-foreground"> · {wait.age}</span>}</>;
  return target
    ? <button type="button" onClick={() => openThread(target)} className="block w-full rounded px-0 text-left hover:underline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Open ${wait.label}`}>{body} <span aria-hidden>↗</span></button>
    : <span className="block">{body}</span>;
}

function Waits({ waits, threadIds, openThread }: { waits: NowWait[]; threadIds: Record<string, string>; openThread(id: string | null): void }) {
  const [all, setAll] = useState(false);
  const shown = all ? waits : waits.slice(0, MAX_WAITS);
  return (
    <>
      {shown.map((wait, i) => <WaitRow key={i} wait={wait} threadIds={threadIds} openThread={openThread} />)}
      {waits.length > MAX_WAITS && !all && <button type="button" onClick={() => setAll(true)} className="text-left text-xs text-muted-foreground hover:underline focus-visible:outline-2 focus-visible:outline-primary">{waits.length - MAX_WAITS} more</button>}
    </>
  );
}

function waitsSummary(waits: NowWait[]): string {
  const names: string[] = [];
  let background = 0;
  for (const wait of waits) {
    if (wait.kind === "background") background += 1;
    else if (!names.includes(wait.label)) names.push(wait.label.toLowerCase() === "you" ? "you" : wait.label);
  }
  if (background) names.push(`${background} background`);
  const joined = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "";
  const oldest = waits.find((w) => w.age)?.age;
  return `${joined}${oldest ? ` · ${oldest}` : ""}`;
}

function FreeText({ text, title, evidence }: { text: string; title: string; evidence: ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <div>
      <p className="m-0 text-xs text-muted-foreground">{title}</p>
      <div className={cx("mt-1 [overflow-wrap:anywhere]", !all && "line-clamp-3")}>{evidence}</div>
      {!all && text.split("\n").length > 3 && <button type="button" onClick={() => setAll(true)} className="mt-1 text-xs text-muted-foreground hover:underline focus-visible:outline-2 focus-visible:outline-primary">Show all</button>}
    </div>
  );
}

export function NowBlock({ now, variant, ledgerPath, report, workspace, threadIds, openThread, renderEvidence }: NowBlockProps) {
  if (nowBlockHidden(now)) return null;
  const stale = now.updated.stale;
  const evidence = renderEvidence;
  const page = variant === "page";
  const folds = (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {now.source === "block" && now.text && <details className="min-w-0">
        <summary className="cursor-pointer text-xs text-muted-foreground">Checkpoint as written</summary>
        <div className="mt-2 [overflow-wrap:anywhere]">{evidence(now.text, ledgerPath, workspace?.ledgerHostId ?? null)}</div>
      </details>}
      {report && <details className="min-w-0">
        <summary className="cursor-pointer text-xs text-muted-foreground">Full last report</summary>
        <div className="mt-2 [overflow-wrap:anywhere]">{evidence(report.text, `${workspace?.rootPath ?? "/"}/`, workspace?.hostId ?? null)}</div>
        {report.truncated && <p className="text-xs text-muted-foreground">Report shortened. Open the orchestrator conversation for the full text.</p>}
      </details>}
    </div>
  );

  return (
    <section aria-label="Right now" className="flex flex-col gap-2 rounded-[10px] border border-border px-3 py-2.5 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-xs font-semibold">Right now</h2>
        {now.updated.label && <span className={cx("text-right tabular-nums", stale ? "text-foreground" : "text-subtle-foreground")} role={stale ? "status" : undefined}>{now.updated.label}</span>}
      </div>
      <p className="m-0 flex items-center gap-2 [overflow-wrap:anywhere]">
        <span aria-hidden className={cx("size-[7px] shrink-0 rounded-full", now.orchestrator.state === "running" ? "animate-pulse bg-foreground motion-reduce:animate-none" : now.orchestrator.state === "asking" ? "bg-attention" : "bg-border")} />
        {orchestratorLine(now)}
      </p>
      <dl className={cx("m-0 flex flex-col gap-1", stale && "text-muted-foreground")}>
        {page && now.lastTurn && <Line label="Last turn">{now.lastTurn.text}{now.lastTurn.age && <span className="text-subtle-foreground"> · {now.lastTurn.age}</span>}</Line>}
        {now.source === "block" && now.doing && <Line label="Doing">{now.doing}</Line>}
        {now.source === "block" && now.blockedBy && <Line label="Blocked by"><span className="text-foreground">Blocked: {now.blockedBy}</span></Line>}
        {now.waits.length > 0 && (page
          ? <Line label="Waits on"><Waits waits={now.waits} threadIds={threadIds} openThread={openThread} /></Line>
          : <Line label="Waits on">{waitsSummary(now.waits)}</Line>)}
        {page && now.source === "block" && now.next && <Line label="Next">{now.next}</Line>}
        {page && now.lastDecision && <Line label="Last decision">{now.lastDecision.text}{now.lastDecision.age && <span className="text-subtle-foreground"> · {now.lastDecision.age}</span>}</Line>}
      </dl>
      {now.source === "text" && now.text && (
        <FreeText text={now.text} title={`Checkpoint (free text)${now.updated.label ? ` · ${now.updated.label}` : ""}`} evidence={evidence(now.text, ledgerPath, workspace?.ledgerHostId ?? null)} />
      )}
      {now.source === "none" && <p className="m-0 text-muted-foreground">This ledger has no Now block yet. Orchestrators write one from the orchestrate version that ships it.</p>}
      {folds}
    </section>
  );
}
