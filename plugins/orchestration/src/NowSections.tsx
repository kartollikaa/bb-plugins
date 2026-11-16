// The human view's sections (docs/human-view.md §2): status line, Working now, Next, Plan, Recently and Details.
import { useState, type ReactNode } from "react";
import type { PlanPart, Sections, StatusState, StepStage, WorkingRow } from "./sections.ts";
import type { View } from "./view.ts";
import { ProgressBar, StepGlyph } from "./Progress.tsx";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** From this many steps, the Plan folds the done steps it starts with. */
export const PLAN_FOLD_FROM = 9;
export const RECENT_SHOWN = 3;

const STATE_DOT: Record<StatusState, string> = {
  needs: "bg-attention",
  blocked: "bg-destructive",
  stuck: "bg-destructive",
  paused: "bg-border",
  running: "bg-blue-500",
  waiting: "bg-warning",
  done: "bg-success",
  planning: "bg-border",
};

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-0.5 pb-1.5">
      <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-subtle-foreground">{children}</h2>
      {aside && <span className="text-xs tabular-nums text-subtle-foreground">{aside}</span>}
    </div>
  );
}

function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={cx("grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export function StatusLine({ sections, variant }: { sections: Sections; variant: "tab" | "page" }) {
  const { status, plan, done } = sections;
  const tail = [status.progress, status.nothingNeedsYou ? "nothing needs you" : null].filter(Boolean).join(" · ");
  return (
    <section aria-label="Status" className="flex flex-col gap-1.5">
      <p className={cx("m-0 flex min-w-0 gap-2", variant === "tab" ? "flex-col items-start gap-0.5" : "items-baseline")} role="status">
        <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold">
          <span aria-hidden className={cx("size-2 rounded-full", STATE_DOT[status.state])} />
          {status.word}
        </span>
        <span className="min-w-0 text-foreground [overflow-wrap:anywhere] [text-wrap:pretty]">{status.sentence}</span>
      </p>
      {plan.length > 0 && <ProgressBar plan={plan} done={done} className="mt-0.5" />}
      {tail && <p className="m-0 text-xs tabular-nums text-muted-foreground">{tail}</p>}
    </section>
  );
}

function OpenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="shrink-0 rounded px-1 text-subtle-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
      <span aria-hidden>↗</span>
    </button>
  );
}

function WorkingLine({ row, threadId, openThread }: { row: WorkingRow; threadId: string | null; openThread(id: string | null): void }) {
  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-2 px-0.5 py-1">
      <StepGlyph glyph={row.state === "running" ? "running" : "todo"} className={row.state === "running" ? "animate-pulse motion-reduce:animate-none" : undefined} />
      <span className="min-w-0 truncate">{row.title}</span>
      <span className="flex items-center gap-1 text-xs leading-[1.6] tabular-nums text-subtle-foreground">
        {row.age}
        {threadId && <OpenButton label={`Open ${row.title}`} onClick={() => openThread(threadId)} />}
      </span>
      {row.detail && <span className="col-start-2 col-end-4 truncate text-xs text-muted-foreground">{row.detail}</span>}
    </li>
  );
}

export function WorkingNow({ sections, variant, threadIds, openThread }: { sections: Sections; variant: "tab" | "page"; threadIds: Record<string, string>; openThread(id: string | null): void }) {
  const rows = variant === "tab" ? sections.working.filter((w) => w.state === "running") : sections.working;
  const o = sections.orchestrator;
  return (
    <section aria-label="Working now">
      <SectionTitle>Working now</SectionTitle>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => <WorkingLine key={row.key} row={row} threadId={threadIds[row.key.replace(/^wait-/, "")] ?? null} openThread={openThread} />)}
        <li className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-2 px-0.5 py-1">
          <StepGlyph glyph={o.state === "running" ? "running" : o.state === "asking" ? "you" : "todo"} />
          <span className="min-w-0 truncate">{o.line}</span>
          <span className="text-xs leading-[1.6] tabular-nums text-subtle-foreground">{o.age}</span>
          {variant === "page" && o.detail && <span className="col-start-2 col-end-4 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{o.detail}</span>}
        </li>
      </ul>
      {sections.background && <p className="m-0 px-0.5 pl-[1.6rem] text-xs text-muted-foreground">{sections.background}</p>}
      {sections.stale && <p className="m-0 px-0.5 pl-[1.6rem] text-xs text-muted-foreground" role="status">May be out of date — the orchestrator has run since it last wrote this</p>}
    </section>
  );
}

export function Next({ text }: { text: string }) {
  return (
    <section aria-label="Next">
      <SectionTitle>Next</SectionTitle>
      <p className="m-0 px-0.5 [overflow-wrap:anywhere] [text-wrap:pretty]">{text}</p>
    </section>
  );
}

const STAGE_WORD: Record<StepStage, string> = { done: "Done", now: "Now", you: "Waits on you", next: "Next" };

/** Filled for a step that is done or under way, outlined for one still ahead. */
const STEP_MARK: Record<PlanPart["glyph"], string> = {
  done: "bg-success text-white",
  running: "bg-blue-500 text-white",
  active: "bg-warning text-white",
  you: "bg-attention text-white",
  stuck: "bg-destructive text-white",
  todo: "border border-border bg-background text-muted-foreground",
};

function StepMark({ part }: { part: PlanPart }) {
  return (
    <span aria-hidden data-stage={part.stage} title={STAGE_WORD[part.stage]} className={cx("relative z-[1] flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", STEP_MARK[part.glyph])}>
      {part.glyph === "done" ? "✓" : part.step}
    </span>
  );
}

const stepState = (part: PlanPart) => (part.stage === "done" ? part.word : `${STAGE_WORD[part.stage]} · ${part.word}${part.age ? ` · ${part.age}` : ""}`);

function PlanRow({ part, last, open, onToggle, threadId, openThread }: { part: PlanPart; last: boolean; open: boolean; onToggle: () => void; threadId: string | null; openThread(id: string | null): void }) {
  const facts: [string, string | null][] = [
    ["Note", part.note],
    ["Last report", part.report],
    ["Checks", part.gate],
    ["Review", part.review],
    ["Runs", part.runs === "—" ? null : part.runs],
    ["Context", part.context === "—" ? null : part.context],
    ["Details", part.details || null],
  ];
  return (
    <li className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 px-1.5" data-step={part.step}>
      {!last && <span aria-hidden className={cx("absolute bottom-0 left-[calc(0.375rem+0.625rem-0.5px)] top-[1.6rem] w-px", part.glyph === "done" ? "bg-success" : "bg-border")} />}
      <span className="pt-[5px]"><StepMark part={part} /></span>
      <div className={cx("min-w-0 rounded-lg pb-1.5", open && "bg-sidebar")}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Step ${part.step}: ${part.title}. ${STAGE_WORD[part.stage]}: ${part.word}`}
          onClick={onToggle}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 rounded-lg px-1.5 py-[5px] text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className={cx("min-w-0 truncate", part.glyph === "done" ? "text-muted-foreground" : "font-medium")}>{part.title}</span>
          <span className={cx("text-right text-xs leading-[1.6] tabular-nums", part.glyph === "done" ? "text-subtle-foreground" : "text-muted-foreground")}>{stepState(part)}</span>
          {part.description && <span className="col-span-2 truncate text-xs text-muted-foreground">{part.description}</span>}
          {part.after && <span className="col-span-2 truncate text-xs text-subtle-foreground">{part.after}</span>}
          {part.archived && <span className="col-span-2 text-xs text-subtle-foreground">Its session has ended; the ledger may be behind</span>}
        </button>
        <Reveal open={open}>
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-1.5 pt-0.5 text-xs">
            {facts.filter(([, value]) => value).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-subtle-foreground">{label}</dt>
                <dd className={cx("m-0 [overflow-wrap:anywhere]", label === "Details" && "text-muted-foreground")}>{value}</dd>
              </div>
            ))}
          </dl>
          {threadId && (
            <div className="flex gap-1.5 px-1.5 pb-1 pt-2">
              <button type="button" tabIndex={open ? 0 : -1} onClick={() => openThread(threadId)} className="h-[26px] rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Open thread</button>
            </div>
          )}
        </Reveal>
      </div>
    </li>
  );
}

/** The done steps a long Plan folds: the run of done steps it starts with. */
export function foldedSteps(plan: readonly PlanPart[]): number {
  if (plan.length < PLAN_FOLD_FROM) return 0;
  const firstOpen = plan.findIndex((p) => p.glyph !== "done");
  const run = firstOpen === -1 ? plan.length : firstOpen;
  return run >= 2 ? run : 0;
}

export function Plan({ sections, variant, threadIds, openThread }: { sections: Sections; variant: "tab" | "page"; threadIds: Record<string, string>; openThread(id: string | null): void }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [shown, setShown] = useState(variant === "page");
  const { plan, done, total } = sections;
  if (!plan.length) return null;
  const toggle = (key: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const folded = showDone ? 0 : foldedSteps(plan);
  const foldable = foldedSteps(plan);
  const list = (
    <ol aria-label="Steps in landing order" className="-mx-1.5 m-0 flex list-none flex-col p-0">
      {foldable > 0 && (
        <li className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 px-1.5">
          <span aria-hidden className="absolute bottom-0 left-[calc(0.375rem+0.625rem-0.5px)] top-[1.6rem] w-px bg-success" />
          <span className="pt-[5px]"><span aria-hidden className="relative z-[1] flex size-5 items-center justify-center rounded-full bg-success text-[11px] font-semibold text-white">✓</span></span>
          <button type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)} className="mb-1.5 rounded-lg px-1.5 py-[5px] text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            {showDone ? "Hide done steps" : `Steps 1–${foldable} done`}
          </button>
        </li>
      )}
      {plan.slice(folded).map((p, i, shownSteps) => (
        <PlanRow key={p.key} part={p} last={i === shownSteps.length - 1} open={open.has(p.key)} onToggle={() => toggle(p.key)} threadId={threadIds[p.key] ?? null} openThread={openThread} />
      ))}
    </ol>
  );
  if (variant === "tab") {
    return (
      <section aria-label="Plan">
        <button type="button" aria-expanded={shown} onClick={() => setShown(!shown)} className="flex w-full items-center gap-1.5 rounded px-0.5 text-left text-xs font-semibold uppercase tracking-[0.04em] text-subtle-foreground hover:text-foreground">
          <span aria-hidden>{shown ? "▾" : "▸"}</span>Plan · {done} of {total} done
        </button>
        {shown && <div className="pt-1.5">{list}</div>}
      </section>
    );
  }
  return (
    <section aria-label="Plan">
      <SectionTitle aside={`${done} of ${total} done`}>Plan</SectionTitle>
      {list}
    </section>
  );
}

export function Recently({ sections, onMore }: { sections: Sections; onMore: () => void }) {
  if (!sections.recently.length) return null;
  return (
    <section aria-label="Recently">
      <SectionTitle>Recently</SectionTitle>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {sections.recently.slice(0, RECENT_SHOWN).map((entry) => (
          <li key={entry.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 px-0.5">
            <span className="text-xs leading-[1.6] tabular-nums text-subtle-foreground">{entry.when}</span>
            <span className="line-clamp-2 [overflow-wrap:anywhere]">{entry.text}</span>
          </li>
        ))}
      </ul>
      {sections.recently.length > RECENT_SHOWN && (
        <button type="button" onClick={onMore} className="mt-1 px-0.5 pl-[5.1rem] text-xs text-muted-foreground hover:text-foreground hover:underline">Show more</button>
      )}
    </section>
  );
}

export interface DetailsProps {
  view: View;
  ledger: { path: string; brief?: string | null };
  report: { text: string; truncated: boolean } | null;
  renderLedgerText(content: string): ReactNode;
  renderReport(content: string): ReactNode;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <><dt className="text-subtle-foreground">{label}</dt><dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{children}</dd></>;
}

export function Details({ view, ledger, report, renderLedgerText, renderReport }: DetailsProps) {
  const [open, setOpen] = useState(false);
  const { sections, history, now } = view;
  const { details } = sections;
  return (
    <section aria-label="Details for debugging" className="border-t border-border pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-baseline gap-1.5 text-xs text-subtle-foreground hover:text-foreground">
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        Details for debugging
        {details.skew && <span className="text-muted-foreground">(ledger times are ahead of this computer's clock)</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-3 pt-2.5 text-xs">
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            {details.statusRaw && <Fact label="Status">{details.statusRaw}</Fact>}
            {now.updated.label && <Fact label="Checkpoint">{now.updated.label}</Fact>}
            {now.mismatch && <Fact label="Chat question">No matching open ask was found in the ledger. Titles are compared ignoring case and punctuation; paraphrases may not match.</Fact>}
            {details.skew && <Fact label="Clock">Some ledger times are later than this computer's clock; they show as clock times.</Fact>}
            <Fact label="Ledger">{history.ledger.replace(/^\/(Users|home)\/[^/]+/, "~")}</Fact>
            <Fact label="Sessions">{history.sessions}</Fact>
            {history.handover && <Fact label="Handover">{history.handover}</Fact>}
            {details.ids.length > 0 && <Fact label="Ids">{details.ids.map((entry) => <span key={entry.id} className="block">{entry.id} · {entry.title}</span>)}</Fact>}
            {history.notes.length > 0 && <Fact label="Notes">{history.notes.map((n, i) => <span key={i} className="block">{n}</span>)}</Fact>}
            {history.freeTextNotes.length > 0 && <Fact label="Free-text notes">{history.freeTextNotes.map((n, i) => <span key={i} className="block">{n}</span>)}</Fact>}
            {history.warnings.length > 0 && <Fact label="Unread">{history.warnings.map((w, i) => <span key={i} className="block">{w}</span>)}</Fact>}
          </dl>
          {now.text && (
            <details className="min-w-0">
              <summary className="cursor-pointer text-muted-foreground">Checkpoint as written</summary>
              <div className="mt-2 [overflow-wrap:anywhere]">{renderLedgerText(now.text)}</div>
            </details>
          )}
          {report && (
            <details className="min-w-0">
              <summary className="cursor-pointer text-muted-foreground">The orchestrator's full last report</summary>
              <div className="mt-2 [overflow-wrap:anywhere]">{renderReport(report.text)}</div>
              {report.truncated && <p className="text-muted-foreground">Report shortened. Open the orchestrator conversation for the full text.</p>}
            </details>
          )}
          {ledger.brief && (
            <details className="min-w-0">
              <summary className="cursor-pointer text-muted-foreground">Brief</summary>
              <div className="mt-2 [overflow-wrap:anywhere]">{renderLedgerText(ledger.brief)}</div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
