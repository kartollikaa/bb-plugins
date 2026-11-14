import { useState, type ReactNode } from "react";
import { useBbNavigate, useComposers, type PluginComposerApi } from "@get-bb/plugin-sdk/app";
import type { Ask, Row, RowKind, View } from "./view.ts";
import { useIsOrchestrator, useOrchestration } from "./useOrchestration.ts";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Puts text into the orchestrator's composer and focuses it; never sends. Keeps a draft the owner already started. */
function fillComposer(composers: readonly PluginComposerApi[], threadId: string, text: string): boolean {
  const composer = composers.find((c) => c.scope.kind === "thread" && c.scope.threadId === threadId);
  if (!composer) return false;
  if (composer.isEmpty) composer.replace({ text, mentions: [] });
  else composer.insert(text, { at: "end", block: true });
  composer.focus();
  return true;
}

const DOT: Record<RowKind, string> = {
  you: "bg-attention",
  work: "bg-foreground",
  stuck: "shadow-[inset_0_0_0_1.25px_var(--foreground)]",
  wait: "shadow-[inset_0_0_0_1.25px_var(--subtle-foreground)]",
  done: "bg-border",
};

function Dot({ kind, className }: { kind: RowKind; className?: string }) {
  return <span aria-hidden className={cx("size-[7px] shrink-0 rounded-full", DOT[kind], className)} />;
}

function Button({ variant, onClick, children, tabIndex }: { variant: "primary" | "quiet" | "outline"; onClick: () => void; children: ReactNode; tabIndex?: number }) {
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      onClick={onClick}
      className={cx(
        "h-[26px] rounded-md px-2.5 text-xs font-medium transition-[transform,background-color] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        variant === "primary" && "bg-primary text-primary-foreground",
        variant === "quiet" && "text-muted-foreground hover:bg-accent hover:text-foreground",
        variant === "outline" && "border border-border text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/** Expands with the row-detail motion from the prototype: grid rows 0fr → 1fr. */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={cx("grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

interface Actions {
  fill(key: string, text: string): void;
  sent: string | null;
  openThread(threadId: string | null): void;
}

function AskCard({ ask, actions, threadId }: { ask: Ask; actions: Actions; threadId: string | null }) {
  const sent = actions.sent === ask.key;
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[color-mix(in_oklab,var(--attention)_35%,transparent)] bg-[color-mix(in_oklab,var(--attention)_12%,var(--background))] px-3 pb-2.5 pt-3">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Dot kind="you" />
        <b className="min-w-0 truncate font-medium text-foreground">{ask.who}</b>
        {ask.age && <span className="ml-auto shrink-0 tabular-nums">{ask.age === "now" ? "just now" : `${ask.age} ago`}</span>}
      </div>
      <p className="line-clamp-4 whitespace-pre-line text-sm leading-[1.45] [overflow-wrap:anywhere]">{ask.text}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {sent ? (
          <span className="text-xs text-muted-foreground">Reply started in the chat composer</span>
        ) : ask.kind === "decision" && ask.drafts ? (
          <>
            <Button variant="primary" onClick={() => actions.fill(ask.key, ask.drafts!.primary)}>Release</Button>
            <Button variant="quiet" onClick={() => actions.fill(ask.key, ask.drafts!.secondary!)}>Not yet</Button>
          </>
        ) : (ask.kind === "question" || ask.kind === "owner") && ask.drafts ? (
          <>
            <Button variant="primary" onClick={() => actions.fill(ask.key, ask.drafts!.primary)}>Answer</Button>
            {threadId && <Button variant="quiet" onClick={() => actions.openThread(threadId)}>Open thread</Button>}
          </>
        ) : threadId ? (
          <Button variant="primary" onClick={() => actions.openThread(threadId)}>Open thread</Button>
        ) : null}
      </div>
    </div>
  );
}

function TeamRow({ row, open, onToggle, actions, threadId }: { row: Row; open: boolean; onToggle: () => void; actions: Actions; threadId: string | null }) {
  return (
    <div className={cx("rounded-lg", open && "bg-sidebar")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="grid w-full grid-cols-[7px_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-lg px-2 py-[7px] text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Dot kind={row.kind} className="mt-1.5" />
        <span className={cx("truncate text-sm", row.kind === "done" && "text-muted-foreground")}>
          <span className="mr-1.5 tabular-nums text-subtle-foreground">{row.id}</span>
          {row.name}
        </span>
        <span className="text-xs leading-[1.6] tabular-nums text-subtle-foreground">{row.age}</span>
        <span className={cx("col-start-2 col-end-4 truncate text-xs", row.kind === "stuck" ? "text-foreground" : "text-muted-foreground")}>{row.step}</span>
      </button>
      <Reveal open={open}>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 pl-[25px] pr-2 pt-0.5 text-xs">
          <dt className="text-subtle-foreground">Runs</dt><dd className="m-0 [overflow-wrap:anywhere]">{row.runs}</dd>
          <dt className="text-subtle-foreground">Context</dt><dd className="m-0 [overflow-wrap:anywhere]">{row.context}</dd>
          <dt className="text-subtle-foreground">Gate</dt><dd className="m-0 [overflow-wrap:anywhere]">{row.gate}</dd>
        </dl>
        <div className="flex gap-1.5 pb-2.5 pl-[25px] pr-2 pt-2">
          {threadId && <Button variant="outline" tabIndex={open ? 0 : -1} onClick={() => actions.openThread(threadId)}>Open thread</Button>}
        </div>
      </Reveal>
    </div>
  );
}

function Fold({ label, onClick, expanded }: { label: string; onClick: () => void; expanded: boolean }) {
  return (
    <button type="button" aria-expanded={expanded} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
      <Dot kind="done" />
      {label}
    </button>
  );
}

function Team({ view, actions, threadIds }: { view: View; actions: Actions; threadIds: Record<string, string> }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const toggle = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const row = (r: Row) => <TeamRow key={r.id} row={r} open={open.has(r.id)} onToggle={() => toggle(r.id)} actions={actions} threadId={threadIds[r.id] ?? null} />;

  if (view.state === "planning") {
    return (
      <section>
        <div className="px-0.5 pb-1.5 text-xs text-subtle-foreground">Team</div>
        <div className="px-0.5 text-xs text-muted-foreground">Subtasks appear here once the orchestrator writes its plan.</div>
      </section>
    );
  }
  if (view.state === "done") {
    const all = view.done.length + view.active.length;
    return (
      <section className="-mx-2 flex flex-col">
        <Fold expanded={showDone} label={showDone ? "Hide the team" : `Show the team (${all})`} onClick={() => setShowDone(!showDone)} />
        {showDone && [...view.active, ...view.done].map(row)}
      </section>
    );
  }
  return (
    <section>
      <div className="flex items-baseline justify-between px-0.5 pb-1.5 text-xs text-subtle-foreground">
        <span>{view.teamLabel}</span>
        <span>{view.activeLabel}</span>
      </div>
      <div className="-mx-2 flex flex-col">
        {view.active.map(row)}
        {view.done.length > 0 && <Fold expanded={showDone} label={showDone ? "Hide done" : `${view.done.length} done`} onClick={() => setShowDone(!showDone)} />}
        {showDone && view.done.map(row)}
      </div>
    </section>
  );
}

function History({ view }: { view: View }) {
  const [open, setOpen] = useState(false);
  const { history } = view;
  return (
    <section className="border-t border-border pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-xs text-subtle-foreground hover:text-foreground">
        {open ? "Hide" : "Goal and history"}
      </button>
      <Reveal open={open}>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 pt-2.5 text-xs">
          {view.goal && <><dt className="text-subtle-foreground">Goal</dt><dd className="m-0 [overflow-wrap:anywhere]">{view.goal}</dd></>}
          <dt className="text-subtle-foreground">Sessions</dt><dd className="m-0">{history.sessions}</dd>
          {history.handover && <><dt className="text-subtle-foreground">Handover</dt><dd className="m-0 [overflow-wrap:anywhere]">{history.handover}</dd></>}
          <dt className="text-subtle-foreground">Ledger</dt><dd className="m-0 [overflow-wrap:anywhere]">{history.ledger.replace(/^\/(Users|home)\/[^/]+/, "~")}</dd>
          {history.warnings.length > 0 && (
            <><dt className="text-subtle-foreground">Unread</dt><dd className="m-0 flex flex-col gap-1 [overflow-wrap:anywhere]">{history.warnings.map((w, i) => <span key={i}>{w}</span>)}</dd></>
          )}
        </dl>
      </Reveal>
    </section>
  );
}

function Message({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 pb-4 pt-5">
      <h2 className="m-0 text-base font-semibold leading-[1.35]">{title}</h2>
      <p className="m-0 text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

export function OrchestrationTab({ threadId }: { threadId: string }) {
  const isOrchestrator = useIsOrchestrator(threadId);
  const state = useOrchestration(threadId, isOrchestrator);
  const composers = useComposers();
  const navigate = useBbNavigate();
  const [sent, setSent] = useState<string | null>(null);
  const [showAllAsks, setShowAllAsks] = useState(false);

  const actions: Actions = {
    sent,
    fill(key, text) {
      if (fillComposer(composers, threadId, text)) setSent(key);
    },
    openThread(childId) {
      if (childId) navigate.toThread(childId, { split: true });
    },
  };

  if (state.kind === "loading") return <Message title="Reading the ledger" body="One moment." />;
  if (state.kind === "none") return <Message title="No orchestration here" body="This thread is not named on the first line of any orchestrate ledger on this computer." />;
  if (state.kind === "error") {
    return <Message title="Can't read the ledger" body={state.message} action={<Button variant="outline" onClick={state.retry}>Try again</Button>} />;
  }

  const { view, threadIds } = state;
  const [first, ...rest] = view.asks;
  const askThread = (ask: Ask) => (ask.key in threadIds ? threadIds[ask.key]! : null);
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 pb-4 pt-5 text-sm leading-[1.45] text-foreground">
      <section>
        <h2 className="m-0 text-base font-semibold leading-[1.35] tracking-[-0.01em] [text-wrap:balance]">{view.heading}</h2>
        <p className="m-0 mt-1 text-muted-foreground [text-wrap:pretty]">{view.subline}</p>
        {view.nudge && (
          <div className="mt-2.5">
            {sent === "nudge"
              ? <span className="text-xs text-muted-foreground">Question started in the chat composer</span>
              : <Button variant="outline" onClick={() => actions.fill("nudge", view.nudge!.draft)}>{view.nudge.label}</Button>}
          </div>
        )}
      </section>

      {view.state === "planning" && view.goal && (
        <section>
          <div className="px-0.5 pb-1.5 text-xs text-subtle-foreground">Goal</div>
          <div className="[overflow-wrap:anywhere]">{view.goal}</div>
        </section>
      )}

      {first && (
        <section className="flex flex-col gap-2">
          <AskCard ask={first} actions={actions} threadId={askThread(first)} />
          {rest.length > 0 && (showAllAsks
            ? rest.map((ask) => <AskCard key={ask.key} ask={ask} actions={actions} threadId={askThread(ask)} />)
            : (
              <button type="button" onClick={() => setShowAllAsks(true)} className="self-start px-0.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                {rest.length} more, oldest first
              </button>
            ))}
        </section>
      )}

      <Team view={view} actions={actions} threadIds={threadIds} />
      {view.state !== "planning" && <History view={view} />}
    </div>
  );
}
