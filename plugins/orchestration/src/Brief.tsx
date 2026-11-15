import { Markdown } from "@get-bb/plugin-sdk/app";
import type { LedgerSummary } from "./contract.ts";
import type { View } from "./view.ts";

export function Brief({ ledger, view }: { ledger: LedgerSummary; view: View }) {
  return (
    <section aria-label="Orchestration brief" className="flex flex-col gap-3 border-b border-border pb-5">
      <h2 className="m-0 text-base font-semibold">Brief</h2>
      {ledger.brief ? <Markdown content={ledger.brief} /> : <>
        <p className="m-0 text-xs text-muted-foreground">Recorded results · {view.done.length} of {ledger.subtasks.length} tasks finished</p>
        <div>
          <h3 className="m-0 mb-1 text-xs font-medium text-muted-foreground">Completed</h3>
          {view.done.length ? <ul className="m-0 space-y-1 pl-4">{view.done.map((row) => <li key={row.id} className="[overflow-wrap:anywhere]">{row.label} · {row.name} <span className="text-muted-foreground">({row.step})</span></li>)}</ul> : <p className="m-0 text-muted-foreground">No completed tasks recorded.</p>}
        </div>
        <div>
          <h3 className="m-0 mb-1 text-xs font-medium text-muted-foreground">Remaining</h3>
          {ledger.subtasks.filter((s) => !view.done.some((row) => row.id === s.id)).map((task) => <p key={task.id} className="m-0 [overflow-wrap:anywhere]">{task.id} · {task.name ?? task.delivery ?? task.id} · {task.statusRaw ?? "Status unknown"}{task.gateLine ? ` · ${task.gateLine}` : ""}</p>)}
          {view.done.length === ledger.subtasks.length && <p className="m-0 text-muted-foreground">{ledger.status === "closed" ? "No remaining tasks recorded." : "Orchestrator closure remains unrecorded."}</p>}
        </div>
      </>}
      {view.history.notes.length > 0 && <div className="text-muted-foreground">{view.history.notes.map((note, i) => <p key={i} className="m-0 [overflow-wrap:anywhere]">{note}</p>)}</div>}
      {ledger.checkpoint?.text && <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Current checkpoint</summary>
        <div className="mt-2 [overflow-wrap:anywhere]"><Markdown content={ledger.checkpoint.text} /></div>
      </details>}
    </section>
  );
}
