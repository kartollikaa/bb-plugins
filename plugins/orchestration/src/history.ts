export interface WorkflowEvent {
  kind: "decision" | "gate" | "handover";
  task: string | null;
  title: string;
  detail: string | null;
  at: string | null;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const rows = (value: unknown): Json[] => Array.isArray(value) ? value.map(obj) : [];
const str = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
const time = (value: unknown) => str(obj(value).at);

export function workflowEvents(data: unknown): WorkflowEvent[] {
  const root = obj(data);
  const events: WorkflowEvent[] = [];
  for (const row of rows(root.decision_journal)) {
    const title = str(row.decision);
    if (title) events.push({ kind: "decision", task: null, title, detail: [str(row.decided_by), str(row.basis)].filter(Boolean).join(" · ") || null, at: time(obj(row.when).time) });
  }
  for (const gate of rows(root.gates)) {
    if (gate.archived && !rows(gate.stages).length) {
      events.push({ kind: "gate", task: str(gate.subtask), title: `${str(gate.id) ?? "Gate"} · archived`, detail: str(gate.archived), at: null });
    }
    for (const stage of rows(gate.stages)) {
      const name = str(stage.name) ?? str(stage.kind);
      if (!name) continue;
      events.push({ kind: "gate", task: str(gate.subtask), title: `${str(gate.id) ?? "Gate"} · ${name} · ${str(stage.state) ?? "unknown"}`, detail: [str(stage.text), str(gate.version), gate.archived ? "Archived gate" : null].filter(Boolean).join(" · ") || null, at: time(stage.time) });
    }
  }
  for (const row of rows(root.handovers)) {
    events.push({ kind: "handover", task: str(row.role) === "orchestrator" ? null : str(row.role), title: `${str(row.role) ?? "Session"} handover`, detail: [str(row.from), str(row.to_id) ?? str(row.to), str(row.why), str(row.next_step)].filter(Boolean).join(" · ") || null, at: time(row.time) });
  }
  const stamp = (event: WorkflowEvent) => event.at && Number.isFinite(Date.parse(event.at)) ? Date.parse(event.at) : Infinity;
  return events.sort((a, b) => stamp(a) - stamp(b));
}
