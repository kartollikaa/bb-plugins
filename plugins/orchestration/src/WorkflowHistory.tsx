import { useState } from "react";
import type { LedgerSummary } from "./contract.ts";
import type { View } from "./view.ts";

export function WorkflowHistory({ ledger, view, openThread }: { ledger: LedgerSummary; view: View; openThread: (id: string) => void }) {
  const [filter, setFilter] = useState("all");
  const [taskId, setTaskId] = useState("");
  const [limit, setLimit] = useState(20);
  const completed = ledger.subtasks.filter((task) => task.status === "landed" || task.status === "verified").length;
  const dropped = ledger.subtasks.filter((task) => task.status === "dropped").length;
  const liveRows = new Map([...view.active, ...view.done].map((row) => [row.id, row]));
  const events = (ledger.workflow ?? []).map((event, key) => ({ ...event, key })).filter((event) => (filter === "all" || event.kind === filter) && (!taskId || event.task === taskId));
  return (
    <section aria-label="Task breakdown and workflow" className="flex min-w-0 flex-col gap-3 border-t border-border pt-4">
      <h2 className="m-0 text-sm font-semibold">Task breakdown</h2>
      <p className="m-0 text-xs text-muted-foreground">{ledger.subtasks.length} tasks · {completed} completed · {dropped} dropped · {ledger.subtasks.length - completed - dropped} remaining</p>
      <p className="m-0 text-xs text-subtle-foreground">All sessions, in plan order. Dependencies show what each task starts after.</p>
      {ledger.subtasks.length === 0 && <p className="m-0 text-xs text-muted-foreground">No tasks recorded yet.</p>}
      <ol className="m-0 list-none divide-y divide-border p-0">
        {ledger.subtasks.map((task) => {
          const row = liveRows.get(task.id);
          return (
            <li key={task.id} className="py-2 text-xs [overflow-wrap:anywhere]">
              <details>
                <summary className="cursor-pointer focus-visible:outline-primary">
                  <span className="font-medium">{task.id}{task.name ? ` · ${task.name}` : ""}</span>
                  <span className="ml-2 text-muted-foreground">{task.status ?? "Status not recorded"}</span>
                </summary>
                <div className="flex flex-col gap-1.5 pb-1 pl-4 pt-2 text-muted-foreground">
                  <span>{task.statusRaw ?? "No ledger status recorded"}</span>
                  {row && <span>Now: {row.step}</span>}
                  <span>{task.dependsOn.length ? `Starts after: ${task.dependsOn.join(", ")}` : "No recorded dependencies"}</span>
                  {task.gateLine && <span>{task.gateLine}</span>}
                  <div className="flex flex-wrap gap-3">
                    {(view.threadIds[task.id] ?? task.threadId) && <button type="button" className="text-foreground underline" onClick={() => openThread((view.threadIds[task.id] ?? task.threadId)!)}>Open thread</button>}
                    <button type="button" className="text-foreground underline" onClick={() => { setTaskId(task.id); setFilter("all"); setLimit(20); }}>Show workflow</button>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
      <h2 className="m-0 mt-2 text-sm font-semibold">Workflow history</h2>
      <p className="m-0 text-xs text-subtle-foreground">Recorded decisions, gate stages and handovers, oldest first. Undated entries follow; task statuses above are current ledger values.</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <select aria-label="Workflow task" value={taskId} onChange={(event) => { setTaskId(event.target.value); setLimit(20); }} className="min-w-0 max-w-full rounded border border-border bg-background p-1.5">
          <option value="">All tasks and orchestrator</option>
          {ledger.subtasks.map((task) => <option key={task.id} value={task.id}>{task.id}{task.name ? ` · ${task.name}` : ""}</option>)}
        </select>
        <select aria-label="Workflow event type" value={filter} onChange={(event) => { setFilter(event.target.value); setLimit(20); }} className="rounded border border-border bg-background p-1.5">
          <option value="all">All events</option><option value="decision">Decisions</option><option value="gate">Gate stages</option><option value="handover">Handovers</option>
        </select>
      </div>
      {!events.length && <p className="m-0 text-xs text-muted-foreground">No recorded events for this selection.</p>}
      <ol className="m-0 list-none border-l border-border pl-4 text-xs">
        {events.slice(0, limit).map((event) => (
          <li key={event.key} className="pb-3 [overflow-wrap:anywhere]">
            <details>
              <summary className="cursor-pointer"><span className="text-muted-foreground">{event.at ?? "Undated"}</span><span className="ml-2">{event.task ? `${event.task} · ` : ""}{event.title}</span></summary>
              {event.detail && <p className="m-0 pt-1 text-muted-foreground whitespace-pre-wrap">{event.detail}</p>}
            </details>
          </li>
        ))}
      </ol>
      {events.length > limit && <button type="button" className="self-start text-xs underline" onClick={() => setLimit(limit + 20)}>Show more ({events.length - limit} remaining)</button>}
    </section>
  );
}
