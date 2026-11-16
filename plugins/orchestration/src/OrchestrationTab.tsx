import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { experimental_useRpcMutation, experimental_useSidebarThreads, Markdown, UrlLink, useBbNavigate, useComposers, type PluginComposerApi } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { contract } from "./contract.ts";
import { answeredStatus } from "./answered.ts";
import { WORK_CATEGORIES } from "./categories.ts";
import { Recap } from "./Recap.tsx";
import { EvidenceMarkdown } from "./EvidenceMarkdown.tsx";
import { Brief } from "./Brief.tsx";
import { WorkflowHistory } from "./WorkflowHistory.tsx";
import { replyKey, replyStatus, type ReplyState } from "./reply.ts";
import { answerLines, chosenAnswers, optionOf, questionKey, splitQuestions } from "./questions.ts";
import { askIdentity, threadsToOpen, type Ask, type Row, type RowKind, type View } from "./view.ts";
import { replies, useIsOrchestrator, useOrchestration } from "./useOrchestration.ts";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const replyKeyOf = (ask: Ask) => replyKey(ask.replyTitle ?? "", ask.replies.map((r) => r.label));

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

export function Button({ variant, onClick, children, tabIndex }: { variant: "primary" | "quiet" | "outline"; onClick: () => void; children: ReactNode; tabIndex?: number }) {
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
  reply(key: string, label: string, text: string, again?: boolean): void;
  /** Sends one message that answers several asks; each ask tracks its own line. */
  replyMany(entries: readonly { key: string; label: string; line: string }[]): void;
  replyState(key: string): ReplyState | null;
  openThread(threadId: string | null): void;
}

function Expandable({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div ref={ref} className={cx("w-full min-w-0 [overflow-wrap:anywhere]", !open && "max-h-[5.8em] overflow-hidden")}>{children}</div>
      {(overflows || open) && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-xs text-muted-foreground hover:text-foreground">
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

const linkButton = "block h-[26px] max-w-full truncate whitespace-nowrap leading-[24px] rounded-md border border-border px-2.5 text-xs font-medium text-foreground no-underline hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** An ask the owner already answered: no attention colour, it waits on the orchestrator to rewrite the line. */
function AnsweredCard({ ask, actions, bare = false }: { ask: Ask; actions: Actions; bare?: boolean }) {
  return (
    <div className={cx("flex flex-col gap-1.5", bare ? "px-3 py-2.5" : "rounded-[10px] border border-border px-3 pb-2.5 pt-3")}>
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Dot kind="wait" />
        <b className="min-w-0 truncate font-medium text-foreground">{ask.who}</b>
      </div>
      {ask.title && <p className="m-0 text-sm leading-[1.4] text-muted-foreground [overflow-wrap:anywhere]">{ask.title}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <span role="status" className="text-xs text-muted-foreground">{answeredStatus(ask.answered!, Date.now())}</span>
        {ask.drafts && <Button variant="quiet" onClick={() => actions.fill(askIdentity(ask), ask.drafts!.primary)}>Other answer</Button>}
        {ask.links.map((l) => <UrlLink key={l.href} href={l.href} title={l.title} className={linkButton}>Open {l.label}</UrlLink>)}
      </div>
    </div>
  );
}

/** Every open question with options in one card: the recommended option preselected, one message answers them all. */
function QuestionsCard({ questions, actions }: { questions: Ask[]; actions: Actions }) {
  const id = useId();
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [preselect] = useState(() => new Set(questions.map(questionKey)));
  const chosen = chosenAnswers(questions, picks, preselect);
  const lines = answerLines(questions, chosen);
  const sending = questions.some((q) => actions.replyState(questionKey(q))?.kind === "sending");
  const whos = [...new Set(questions.map((q) => q.who))];
  const links = [...new Map(questions.flatMap((q) => q.links).map((l) => [l.href, l])).values()];
  const pick = (q: Ask, label: string) => setPicks({ ...picks, [questionKey(q)]: chosen[questionKey(q)] === label ? "" : label });
  const onKey = (q: Ask, index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + q.replies.length) % q.replies.length;
    setPicks({ ...picks, [questionKey(q)]: q.replies[next]!.label });
    (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-[color-mix(in_oklab,var(--attention)_35%,transparent)] bg-[color-mix(in_oklab,var(--attention)_12%,var(--background))] px-3 pb-3 pt-3">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Dot kind="you" />
        <b className="min-w-0 truncate font-medium text-foreground">{whos.length === 1 ? whos[0] : "Questions"}</b>
        <span className="ml-auto shrink-0 tabular-nums">{questions.length} questions</span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {questions.map((q, i) => {
          const key = questionKey(q);
          const labelId = `${id}-q${i}`;
          const focusable = chosen[key] ?? q.replies[0]!.label;
          return (
            <li key={key} className={cx("flex flex-col gap-1.5", i > 0 && "border-t border-[color-mix(in_oklab,var(--attention)_25%,transparent)] pt-3")}>
              <p id={labelId} className="m-0 text-sm font-semibold leading-[1.4] [overflow-wrap:anywhere]">
                {whos.length > 1 && <span className="mr-1.5 font-normal text-muted-foreground">{q.who}</span>}
                {q.title}
                {!preselect.has(key) && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· new</span>}
              </p>
              {q.text && <p className="m-0 text-xs leading-[1.45] text-muted-foreground [overflow-wrap:anywhere]">{q.text}</p>}
              <div className="flex flex-wrap items-center gap-1.5">
                <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap items-center gap-1.5">
                  {q.replies.map((r, index) => {
                    const on = chosen[key] === r.label;
                    const { text, mark } = optionOf(r.label);
                    return (
                      <button
                        key={r.label}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        tabIndex={r.label === focusable ? 0 : -1}
                        disabled={sending}
                        onClick={() => pick(q, r.label)}
                        onKeyDown={onKey(q, index)}
                        className={cx(
                          "min-h-[26px] max-w-full rounded-md border px-2.5 py-[3px] text-left text-xs leading-[1.35] transition-[transform,background-color] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none [overflow-wrap:anywhere]",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
                          on ? "border-primary bg-primary font-medium text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent",
                        )}
                      >
                        {text}
                        {mark && <span className={cx("ml-1.5", on ? "opacity-80" : "text-muted-foreground")}>· {mark}</span>}
                      </button>
                    );
                  })}
                </div>
                {q.drafts && <Button variant="quiet" onClick={() => actions.fill(askIdentity(q), q.drafts!.primary)}>Other answer</Button>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[color-mix(in_oklab,var(--attention)_25%,transparent)] pt-3">
        <button
          type="button"
          disabled={sending || lines.length === 0}
          onClick={() => actions.replyMany(lines)}
          className="h-[26px] rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 motion-reduce:transition-none"
        >
          {sending ? "Sending…" : lines.length === questions.length ? `Send ${lines.length} answers` : `Send ${lines.length} of ${questions.length}`}
        </button>
        <span className="text-xs text-muted-foreground">
          {lines.length < questions.length ? `${questions.length - lines.length} without a pick stay open · click a pick again to clear it` : "One message to the orchestrator · click a pick again to clear it"}
        </span>
        {links.map((l) => <UrlLink key={l.href} href={l.href} title={l.title} className={linkButton}>Open {l.label}</UrlLink>)}
      </div>
    </div>
  );
}

function AskCard({ ask, actions, threadId }: { ask: Ask; actions: Actions; threadId: string | null }) {
  const sent = actions.sent === askIdentity(ask);
  const id = askIdentity(ask);
  const remembered = ask.replies.length ? actions.replyState(replyKeyOf(ask)) : null;
  /** A finished send on a card that still waits belongs to an earlier asking of the same line. */
  const replied = remembered?.kind === "sent" ? null : remembered;
  const threads = threadsToOpen(ask, threadId);
  const answerable = (ask.kind === "question" || ask.kind === "owner") && ask.drafts;
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[color-mix(in_oklab,var(--attention)_35%,transparent)] bg-[color-mix(in_oklab,var(--attention)_12%,var(--background))] px-3 pb-2.5 pt-3">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Dot kind="you" />
        <b className="min-w-0 truncate font-medium text-foreground">{ask.who}</b>
        {ask.freeText && <span className="shrink-0 rounded-full border border-border px-1.5 text-[11px] leading-[16px]">written as free text</span>}
        {ask.age && <span className="ml-auto shrink-0 tabular-nums">{ask.age === "now" ? "just now" : `${ask.age} ago`}</span>}
      </div>
      {ask.title && <p className="m-0 text-sm font-semibold leading-[1.4] [overflow-wrap:anywhere]">{ask.title}</p>}
      {ask.group && (
        <details>
          <summary className="cursor-pointer text-xs font-medium">Show the {ask.group.length} lines</summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {ask.group.map((line) => (
              <li key={line.key} className="flex flex-col gap-1 border-t border-[color-mix(in_oklab,var(--attention)_25%,transparent)] pt-2 text-sm [overflow-wrap:anywhere]">
                <span>{line.subtask ? <b className="mr-1.5 font-medium">{line.subtask}</b> : null}{line.title}</span>
                {line.answered ? <span role="status" className="text-xs text-muted-foreground">{answeredStatus(line.answered, Date.now())}</span>
                  : line.drafts && <span><Button variant="quiet" onClick={() => actions.fill(askIdentity(line), line.drafts!.primary)}>Answer</Button></span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {ask.text && (
        <Expandable>
          <Markdown content={ask.text} className={cx("text-sm leading-[1.45]", ask.title && "text-muted-foreground")} />
        </Expandable>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {replied ? (
          <span role="status" className="text-xs text-muted-foreground">{replyStatus(replied, Date.now())}</span>
        ) : sent ? (
          <span className="text-xs text-muted-foreground">Reply started in the chat composer</span>
        ) : ask.kind === "decision" && ask.drafts ? (
          <>
            <Button variant="primary" onClick={() => actions.fill(id, ask.drafts!.primary)}>Land it</Button>
            <Button variant="quiet" onClick={() => actions.fill(id, ask.drafts!.secondary!)}>Not yet</Button>
          </>
        ) : answerable ? (
          <>
            {ask.replies.map((r, i) => <Button key={i} variant={i === 0 ? "primary" : "outline"} onClick={() => actions.reply(replyKeyOf(ask), r.label, r.draft, remembered?.kind === "sent")}>{r.label}</Button>)}
            <Button variant={ask.replies.length ? "quiet" : "primary"} onClick={() => actions.fill(id, ask.drafts!.primary)}>{ask.replies.length ? "Other answer" : "Answer"}</Button>
          </>
        ) : null}
        {ask.links.map((l) => <UrlLink key={l.href} href={l.href} title={l.title} className={linkButton}>Open {l.label}</UrlLink>)}
        {threads.map((t) => <Button key={t} variant="primary" onClick={() => actions.openThread(t)}>{threads.length > 1 ? `Open ${t}` : "Open thread"}</Button>)}
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
        <Dot kind={row.kind} className={cx("mt-1.5", row.running && "animate-pulse motion-reduce:animate-none")} />
        <span className={cx("truncate text-sm", row.kind === "done" && "text-muted-foreground")}>
          {row.label && <span className="mr-1.5 tabular-nums text-subtle-foreground">{row.label}</span>}
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
        {view.active.length > 0 && <div className="-mx-2 mt-1.5 flex flex-col">{view.active.map(row)}</div>}
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
        {WORK_CATEGORIES.filter((category) => category !== "Done").map((category) => {
          const grouped = view.active.filter((r) => (r.running || r.kind === "you" ? "Active" : r.kind === "wait" ? "Planned" : "Idle / waiting") === category);
          return grouped.length ? <section key={category} aria-label={category}><h3 className="m-0 px-2 pb-1 pt-3 text-xs font-medium text-subtle-foreground">{category} · {grouped.length}</h3>{grouped.map(row)}</section> : null;
        })}
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
        {open ? "Hide history" : "History"}
      </button>
      <Reveal open={open}>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 pt-2.5 text-xs">
          <dt className="text-subtle-foreground">Sessions</dt><dd className="m-0">{history.sessions}</dd>
          {history.handover && <><dt className="text-subtle-foreground">Handover</dt><dd className="m-0 [overflow-wrap:anywhere]">{history.handover}</dd></>}
          <dt className="text-subtle-foreground">Ledger</dt><dd className="m-0 [overflow-wrap:anywhere]">{history.ledger.replace(/^\/(Users|home)\/[^/]+/, "~")}</dd>
          {history.notes.length > 0 && (
            <><dt className="text-subtle-foreground">Notes</dt><dd className="m-0 flex flex-col gap-1 [overflow-wrap:anywhere]">{history.notes.map((n, i) => <span key={i}>{n}</span>)}</dd></>
          )}
          {history.warnings.length > 0 && (
            <><dt className="text-subtle-foreground">Unread</dt><dd className="m-0 flex flex-col gap-1 [overflow-wrap:anywhere]">{history.warnings.map((w, i) => <span key={i}>{w}</span>)}</dd></>
          )}
        </dl>
      </Reveal>
    </section>
  );
}

function ThreadRecap({ view, threadId, withTitle }: { view: View; threadId: string; withTitle: boolean }) {
  const title = experimental_useSidebarThreads().threads.find((t) => t.id === threadId)?.displayTitle ?? null;
  return <Recap view={view} title={title} withTitle={withTitle} />;
}

export function Message({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 pb-4 pt-5">
      <h2 className="m-0 text-base font-semibold leading-[1.35]">{title}</h2>
      <p className="m-0 text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

/** `revealComposer` runs before a draft goes in; the page uses it to focus its composer. */
export function OrchestrationTab({ threadId, revealComposer, variant = "tab", noneAction, openChild }: { threadId: string; revealComposer?: () => Promise<void>; variant?: "tab" | "page"; noneAction?: ReactNode; openChild?: (id: string) => void }) {
  const isOrchestrator = useIsOrchestrator(threadId);
  const state = useOrchestration(threadId, isOrchestrator);
  const composers = useComposers();
  const composersRef = useRef(composers);
  composersRef.current = composers;
  const navigate = useBbNavigate();
  const [sent, setSent] = useState<string | null>(null);
  const [section, setSection] = useState<"now" | "work" | "activity">("now");
  const replyMutation = experimental_useRpcMutation({ contract, method: "reply" });
  useSyncExternalStore(replies.subscribe, replies.version);
  const liveAsks = state.kind === "ready" ? [...state.view.asks, ...state.view.answered].filter((ask) => ask.replies.length).map(replyKeyOf) : null;
  const liveKey = liveAsks?.join("\u0001") ?? null;
  useEffect(() => {
    if (liveAsks) replies.prune(threadId, liveAsks);
  }, [threadId, liveKey]);

  const actions: Actions = {
    sent,
    replyState: (key) => replies.get(threadId, key),
    replyMany(entries) {
      const started = entries.flatMap(({ key, label, line }) => {
        const token = replies.get(threadId, key)?.kind === "sent" ? replies.again(threadId, key, label) : replies.begin(threadId, key, label);
        return token === null ? [] : [{ key, token, line }];
      });
      if (!started.length) return;
      replyMutation.mutate({ threadId, text: started.map((s) => s.line).join("\n") }).then(
        ({ delivery }) => started.forEach(({ key, token }) => replies.done(threadId, key, token, delivery)),
        (error: unknown) => {
          started.forEach(({ key, token }) => replies.fail(threadId, key, token));
          toast.error("Couldn't send the answers", { description: error instanceof Error ? error.message : String(error) });
        },
      );
    },
    reply(key, label, text, again) {
      const token = again ? replies.again(threadId, key, label) : replies.begin(threadId, key, label);
      if (token === null) return;
      replyMutation.mutate({ threadId, text }).then(
        ({ delivery }) => replies.done(threadId, key, token, delivery),
        (error: unknown) => {
          replies.fail(threadId, key, token);
          toast.error(`Couldn't send «${label}»`, { description: error instanceof Error ? error.message : String(error) });
        },
      );
    },
    fill(key, text) {
      void (async () => {
        await revealComposer?.();
        const until = Date.now() + 3000;
        while (Date.now() < until) {
          if (fillComposer(composersRef.current, threadId, text)) { setSent(key); return; }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        toast.error("Could not open the orchestrator composer. Try again.");
      })();
    },
    openThread(childId) {
      if (childId) { if (openChild) openChild(childId); else navigate.toThread(childId); }
    },
  };

  if (state.kind === "loading") return <Message title="Reading the ledger" body="One moment." />;
  if (state.kind === "none") return <Message title="No orchestration here" body="This thread is not named on the first line of any orchestrate ledger on this computer." action={noneAction} />;
  if (state.kind === "error") {
    return <Message title="Can't read the ledger" body={state.message} action={<Button variant="outline" onClick={state.retry}>Try again</Button>} />;
  }

  const { view, threadIds } = state;
  const { questions, rest } = splitQuestions(view.asks);
  const askThread = (ask: Ask) => (ask.key in threadIds ? threadIds[ask.key]! : null);
  return (
    <div className={cx("flex flex-col gap-6 text-sm leading-[1.45] text-foreground", variant === "tab" ? "h-full overflow-y-auto px-4 pb-4 pt-5" : "mx-auto w-full max-w-[680px] px-6 pb-6 pt-6")}>
      <ThreadRecap view={view} threadId={threadId} withTitle={variant === "page"} />

      <nav aria-label="Orchestration sections" className="flex gap-1 border-b border-border pb-2">
        {(["now", "work", "activity"] as const).map((item) => <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)} className={cx("rounded-md px-3 py-1.5 text-xs capitalize hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary", section === item ? "bg-accent font-medium text-foreground" : "text-muted-foreground")}>{item === "now" ? `Now${view.asks.length ? ` · ${view.asks.length}` : ""}` : item}</button>)}
      </nav>
      {section === "now" ? <>
      <section>
        <h2 className="m-0 text-base font-semibold leading-[1.35] tracking-[-0.01em] [text-wrap:balance]">{view.heading}</h2>
        <p className="m-0 mt-1 text-muted-foreground [text-wrap:pretty]">{view.subline}</p>
        {view.nudge && (
          <div className="mt-2.5">
            {sent === `nudge\u0000${view.nudge.label}`
              ? <span className="text-xs text-muted-foreground">Question started in the chat composer</span>
              : <Button variant="outline" onClick={() => actions.fill(`nudge\u0000${view.nudge!.label}`, view.nudge!.draft)}>{view.nudge.label}</Button>}
          </div>
        )}
      </section>

      {view.asks.length > 0 && (
        <section className="flex flex-col gap-2">
          {questions.length > 0 && <QuestionsCard questions={questions} actions={actions} />}
          {rest.map((ask) => <AskCard key={ask.key} ask={ask} actions={actions} threadId={askThread(ask)} />)}
        </section>
      )}

      {view.answered.length === 1 && <AnsweredCard ask={view.answered[0]!} actions={actions} />}
      {view.answered.length > 1 && (
        <section aria-label="Answered" className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
          {view.answered.map((ask) => <AnsweredCard key={ask.key} ask={ask} actions={actions} bare />)}
        </section>
      )}

      <Brief ledger={state.ledger} view={view} report={state.report} threadId={threadId} workspace={state.workspace} />
      <Team view={view} actions={actions} threadIds={threadIds} />
      {view.state !== "planning" && <History view={view} />}
      </> : <WorkflowHistory key={`${threadId}:${section}`} ledger={state.ledger} view={view} openThread={actions.openThread} mode={section} renderEvidence={(content) => <EvidenceMarkdown content={content} sourcePath={state.ledger.path} hostId={state.workspace?.ledgerHostId ?? null} threadId={threadId} workspace={state.workspace} />} />}
    </div>
  );
}
