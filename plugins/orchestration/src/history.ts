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
    const stages = rows(gate.stages).filter((stage) => {
      const text = str(stage.text);
      return text && !["pending", "unknown", "—"].includes(text);
    });
    if (stages.length) {
      const dated = stages.map((stage) => time(stage.time)).filter((at): at is string => !!at && Number.isFinite(Date.parse(at))).sort((a, b) => Date.parse(a) - Date.parse(b));
      events.push({ kind: "gate", task: str(gate.subtask), title: `Delivery review · ${str(gate.id) ?? "Gate"}`, detail: [str(gate.version) ? `Revision ${str(gate.version)}` : null, ...stages.map((stage) => `${str(stage.name) ?? "Evidence"}: ${str(stage.text)}`)].filter(Boolean).join("\n\n"), at: dated.at(-1) ?? null });
    }
  }
  for (const row of rows(root.handovers)) {
    events.push({ kind: "handover", task: str(row.role) === "orchestrator" ? null : str(row.role), title: `${str(row.role) ?? "Session"} handover`, detail: [str(row.from), str(row.to_id) ?? str(row.to), str(row.why), str(row.next_step)].filter(Boolean).join(" · ") || null, at: time(row.time) });
  }
  const stamp = (event: WorkflowEvent) => event.at && Number.isFinite(Date.parse(event.at)) ? Date.parse(event.at) : Infinity;
  return events.sort((a, b) => stamp(a) - stamp(b));
}

export function recentEvents<T extends WorkflowEvent>(events: T[]): T[] {
  const stamp = (event: WorkflowEvent) => event.at && Number.isFinite(Date.parse(event.at)) ? Date.parse(event.at) : null;
  return [...events].sort((a, b) => {
    const left = stamp(a), right = stamp(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return right - left;
  });
}
