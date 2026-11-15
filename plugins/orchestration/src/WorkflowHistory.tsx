import { useState, type ReactNode } from "react";
import type { LedgerSummary, Subtask } from "./contract.ts";
import { workCategory, WORK_CATEGORIES } from "./categories.ts";
import { recentEvents } from "./history.ts";
import type { View } from "./view.ts";

const labels: Record<string, string> = { planned: "Planned", "waiting-dependency": "Queued", working: "In progress", briefed: "Starting", gate: "In review", delivered: "Delivered", ready: "Ready", question: "Needs input", card: "Needs input", blocked: "Blocked", landed: "Landed", verified: "Verified", dropped: "Dropped" };
const finished = (task: Subtask) => ["landed", "verified", "dropped"].includes(task.status ?? "");
const control = "rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";

export function WorkflowHistory({ ledger, view, openThread, mode, renderEvidence = (text) => text }: { ledger: LedgerSummary; view: View; openThread: (id: string) => void; mode: "work" | "activity"; renderEvidence?: (text: string) => ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(12);
  const rows = new Map([...view.active, ...view.done].map((row) => [row.id, row]));
  const title = (task: Subtask) => task.name ?? task.delivery ?? (rows.get(task.id)?.name !== task.id ? rows.get(task.id)?.name : null) ?? "Task description not recorded";
  const asking = (task: Subtask) => view.asks.some((ask) => ask.key === task.id || ask.subtask === task.id);
  const activeAgain = (task: Subtask) => finished(task) && (asking(task) || !!rows.get(task.id) && rows.get(task.id)!.kind !== "done");
  const isFinished = (task: Subtask) => finished(task) && !activeAgain(task);
  const done = ledger.subtasks.filter(isFinished).length;
  const blocked = (task: Subtask) => task.status === "blocked" || task.gateFailures > 0;
  const priority = (task: Subtask) => asking(task) ? 0 : blocked(task) ? 1 : 2;
  const tasks = ledger.subtasks.filter((task) => filter === "all" || (filter === "done" ? isFinished(task) : !isFinished(task)));
  const events = recentEvents((ledger.workflow ?? []).map((event, key) => ({ ...event, key })).filter((event) => !selected || event.task === selected));
  return (
    <section aria-label={mode === "work" ? "Work breakdown" : "Activity"} className="flex min-w-0 flex-col gap-4">
      {mode === "work" ? <>
        <dl className="m-0 grid grid-cols-2 gap-2" aria-label="Work summary">{[
          ["Needs you", ledger.subtasks.filter(asking).length],
          ["Blocked / failed gates", ledger.subtasks.filter(blocked).length],
          ["Running now", ledger.subtasks.filter((task) => rows.get(task.id)?.running).length],
          ["Evidence recorded", ledger.subtasks.filter((task) => task.evidence?.length).length],
        ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-border bg-sidebar px-3 py-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="m-0 mt-1 text-xl font-medium tabular-nums">{value}</dd></div>)}</dl>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex rounded-lg bg-sidebar p-0.5" aria-label="Work filter">{[["all", "All work"], ["active", "Remaining"], ["done", "Finished"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value!)} className={`${control} ${filter === value ? "bg-accent text-foreground" : ""}`}>{label}</button>)}</div>
          <span className="shrink-0 text-subtle-foreground tabular-nums">{done} / {ledger.subtasks.length} finished</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-border" aria-label={`${done} of ${ledger.subtasks.length} tasks finished`}><div className="h-full bg-muted-foreground" style={{ width: `${ledger.subtasks.length ? done / ledger.subtasks.length * 100 : 0}%` }} /></div>
        {!tasks.length && <p className="m-0 text-sm text-muted-foreground">No tasks in this view.</p>}
        <div className="-mx-2 flex flex-col gap-4">{WORK_CATEGORIES.map((category) => {
          const grouped = tasks.filter((task) => workCategory(task.status, rows.get(task.id)?.running ?? false, asking(task)) === category).sort((a, b) => priority(a) - priority(b));
          return grouped.length ? <section key={category} aria-label={category}><h3 className="m-0 px-2 pb-1 text-xs font-medium text-subtle-foreground">{category} · {grouped.length}</h3>{grouped.map((task) => {
          const open = selected === task.id;
          const row = rows.get(task.id);
          const resumed = activeAgain(task);
          const state = resumed ? (asking(task) ? "Needs input again" : "Active again") : labels[task.status ?? ""] ?? "Status not recorded";
          const thread = view.threadIds[task.id] ?? task.threadId;
          return <article key={task.id} className={`rounded-lg border ${asking(task) || blocked(task) ? "border-foreground/30 bg-sidebar" : "border-border"} ${open ? "bg-sidebar" : ""}`}>
            <button type="button" aria-expanded={open} onClick={() => setSelected(open ? null : task.id)} className="flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
              <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${isFinished(task) ? "bg-border" : "bg-foreground"}`} />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-snug [overflow-wrap:anywhere]">{title(task)}</span><span className="mt-1 block text-xs text-subtle-foreground">{task.id} · {state}{task.gateFailures > 0 ? ` · ${task.gateFailures} failed gates` : ""} · {task.evidence?.length ? `${task.evidence.length} evidence entries` : "Evidence not recorded"}</span></span>
              <span aria-hidden className="text-xs text-subtle-foreground">{open ? "−" : "+"}</span>
            </button>
            {open && <div className="flex flex-col gap-4 pb-4 pl-[26px] pr-3 text-xs">
              {task.statusRaw && <p className="m-0 text-muted-foreground [overflow-wrap:anywhere]">{task.statusRaw}</p>}
              {resumed && row && <p className="m-0 text-muted-foreground">{row.step}</p>}
              {!!task.dependsOn.length && <div><h3 className="m-0 mb-2 font-medium">Depends on</h3><ul className="m-0 flex list-none flex-col gap-2 p-0">{task.dependsOn.map((id) => {
                const dependency = ledger.subtasks.find((item) => item.id === id);
                return <li key={id}>{dependency ? <button type="button" className={`${control} w-full text-left [overflow-wrap:anywhere]`} onClick={() => { setFilter("all"); setSelected(id); }}>{id} · {title(dependency)} · {labels[dependency.status ?? ""] ?? "Status not recorded"}{activeAgain(dependency) ? " · Active again" : ""}</button> : <span className="text-muted-foreground">{id} · Task not recorded</span>}</li>;
              })}</ul></div>}
              {task.dependencyNote && <p className="m-0 text-muted-foreground">Dependency conditions: {task.dependencyNote}</p>}
              {task.areas && <div><h3 className="m-0 mb-1 font-medium">Scope</h3><p className="m-0 text-muted-foreground [overflow-wrap:anywhere]">{task.areas}</p></div>}
              {!!task.criteria?.length && <div><h3 className="m-0 mb-2 font-medium">Acceptance criteria</h3><p className="m-0 mb-2 text-subtle-foreground">Requirements, not checked results.</p><ul className="m-0 list-disc space-y-2 pl-4 text-muted-foreground">{task.criteria.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
              {!!task.evidence?.length && <div><h3 className="m-0 mb-2 font-medium">Delivery evidence</h3><dl className="m-0 space-y-3">{task.evidence.map((item, index) => <div key={index}><dt className="capitalize text-subtle-foreground">{item.label}</dt><dd className="m-0 mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">{renderEvidence(item.text)}</dd></div>)}</dl></div>}
              {!task.evidence?.length && <p className="m-0 text-subtle-foreground">Delivery evidence not recorded.</p>}
              <p className="m-0 text-subtle-foreground [overflow-wrap:anywhere]">{task.version && !["pending", "—"].includes(task.version) ? `Revision ${task.version}` : "Revision not recorded"} · Evidence dates: see recorded delivery activity.</p>
              {thread && <button type="button" onClick={() => openThread(thread)} className={`${control} self-start border border-border`}>Open task conversation ↗</button>}
            </div>}
          </article>;
        })}</section> : null; })}</div>
      </> : <>
        <div className="flex items-center justify-between gap-3"><h2 className="m-0 text-sm font-medium">Decisions & delivery</h2><select aria-label="Activity task" value={selected ?? ""} onChange={(event) => { setSelected(event.target.value || null); setLimit(12); }} className="max-w-[55%] rounded-md border border-border bg-background px-2 py-1.5 text-xs"><option value="">All work</option>{ledger.subtasks.map((task) => <option key={task.id} value={task.id}>{task.id} · {title(task)}</option>)}</select></div>
        <p className="m-0 text-xs text-subtle-foreground">Latest recorded activity first. Open a delivery to read its checks, review and outcome.</p>
        {!events.length && <p className="m-0 text-sm text-muted-foreground">No activity recorded for this selection.</p>}
        <div className="flex flex-col gap-2">{events.slice(0, limit).map((event) => <article key={event.key} className="rounded-lg bg-sidebar px-3 py-3 text-xs"><div className="mb-1 text-subtle-foreground">{event.task ? `${event.task} · ` : ""}{event.kind === "gate" ? "Delivery" : event.kind === "handover" ? "Session handover" : "Decision"}{event.at ? ` · ${event.at}` : " · Date not recorded"}</div><p className="m-0 text-sm leading-snug [overflow-wrap:anywhere]">{event.title}</p>{event.detail && <details className="mt-2"><summary className="cursor-pointer text-muted-foreground focus-visible:outline-primary">{event.kind === "gate" ? "Read delivery evidence" : "Read context"}</summary><p className="m-0 mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{event.detail}</p></details>}</article>)}</div>
        {events.length > limit && <button type="button" onClick={() => setLimit(limit + 12)} className={`${control} self-start`}>Earlier activity</button>}
      </>}
    </section>
  );
}
