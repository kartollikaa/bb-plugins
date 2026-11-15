// Reads the orchestrate plugin's ledger export (schema «orchestrate-ledger-export» v1) into what the tab shows.
import type { LedgerSummary, Subtask } from "./contract.ts";
import { workflowEvents } from "./history.ts";

export const EXPORT_SCHEMA = "orchestrate-ledger-export";
export const EXPORT_VERSION = 1;

const THREAD_ID = /\bthr_[a-z0-9]+\b/;
const STATUSES = new Set(["planned", "card", "briefed", "waiting-dependency", "working", "question", "blocked", "delivered", "gate", "ready", "landed", "verified", "dropped"]);
const FAILURE_KINDS = new Set(["checks", "review", "done_when", "conflicts"]);
const GATE_LINE_KINDS = ["checks", "review", "done_when", "conflicts", "landing", "after_landing"] as const;
const KIND_LABEL: Record<string, string> = {
  checks: "checks",
  review: "review",
  done_when: "done-when",
  conflicts: "conflicts",
  landing: "landing",
  after_landing: "after-landing check",
};

/** The orchestrator id a ledger's first line names: a bb thread id when present, else its first word. */
export function orchestratorIdOf(firstLine: string): string | null {
  const match = /^\s*(?:Orchestrator|Оркестратор)\s*:\s*(.*)$/i.exec(firstLine);
  if (!match) return null;
  const rest = match[1]!.trim();
  return THREAD_ID.exec(rest)?.[0] ?? rest.split(/\s+/)[0] ?? null;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

function threadIdOf(value: unknown): string | null {
  const text = str(value);
  return text ? (THREAD_ID.exec(text)?.[0] ?? null) : null;
}

/** The export maps only an exact status cell; «delivered; review R1» still starts with one. */
function statusFromRaw(raw: string | null): string | null {
  const word = raw?.trim().split(/[\s;,(]/)[0]?.toLowerCase() ?? "";
  return STATUSES.has(word) ? word : null;
}

function gateLine(summary: Json, failures: number): string {
  const parts: string[] = [];
  for (const kind of GATE_LINE_KINDS) {
    const state = str(obj(summary[kind]).state);
    if (!state || state === "pending" || state === "unknown") continue;
    parts.push(`${KIND_LABEL[kind]} ${state}`);
  }
  if (failures >= 2) parts.push(`${failures} failures`);
  if (parts.length === 0) return "In the gate, nothing has run yet";
  const line = parts.join(" · ");
  return line[0]!.toUpperCase() + line.slice(1);
}

export function summarizeExport(data: unknown, path: string): LedgerSummary {
  const root = obj(data);
  const warnings = arr(root.warnings).flatMap((w) => (typeof w === "string" ? [w] : []));
  if (root.schema !== EXPORT_SCHEMA) warnings.push(`Unexpected export schema ${String(root.schema)}`);
  else if (root.schema_version !== EXPORT_VERSION) warnings.push(`Export schema version ${String(root.schema_version)}; this view reads version ${EXPORT_VERSION}`);

  const gates = arr(root.gates).map(obj).filter((gate) => gate.archived == null);
  const handovers = arr(root.handovers).map(obj);

  const subtasks: Subtask[] = arr(root.subtasks).map(obj).flatMap((row) => {
    const id = str(row.id);
    if (!id) return [];
    const own = gates.filter((gate) => gate.subtask === id);
    let failures = 0;
    let lastFailedKind: string | null = null;
    for (const gate of own) {
      for (const stage of arr(gate.stages).map(obj)) {
        if (stage.state === "failed" && FAILURE_KINDS.has(String(stage.kind))) {
          failures += 1;
          lastFailedKind = KIND_LABEL[String(stage.kind)] ?? null;
        }
      }
    }
    const latestGate = own.at(-1);
    const roleHandovers = handovers.filter((h) => h.role === id);
    const status = obj(row.status);
    return [{
      id,
      name: str(row.name) ?? str(row.delivery),
      delivery: str(row.delivery),
      version: str(row.version),
      areas: str(row.areas),
      criteria: Object.entries(obj(root.done_when)).flatMap(([key, value]) => {
        const range = /^([A-Z]+)(\d+)[–-]([A-Z]+)(\d+)$/.exec(key);
        const task = /^([A-Z]+)(\d+)$/.exec(id);
        const shared = range && task && range[1] === task[1] && range[3] === task[1] && Number(task[2]) >= Number(range[2]) && Number(task[2]) <= Number(range[4]);
        return key === id || shared ? arr(value).flatMap((line) => typeof line === "string" ? [shared ? `Shared criterion (${key}): ${line}` : line] : []) : [];
      }),
      evidence: arr(latestGate?.stages).map(obj).flatMap((stage) => {
        const text = str(stage.text);
        return text && !["pending", "unknown", "—"].includes(text) ? [{ label: str(stage.name) ?? "Evidence", text }] : [];
      }),
      threadId: threadIdOf(row.session) ?? threadIdOf(roleHandovers.at(-1)?.to_id),
      status: str(status.value) ?? statusFromRaw(str(status.raw)),
      statusRaw: str(status.raw),
      modelRaw: str(obj(row.model_effort).raw),
      dependsOn: arr(row.depends_on).flatMap((d) => typeof d === "string" && (arr(root.subtasks).some((task) => obj(task).id === d) || /^[A-Z]+\d+[a-z]*$/.test(d)) ? [d] : []),
      dependencyNote: arr(row.depends_on).filter((d) => typeof d === "string" && !arr(root.subtasks).some((task) => obj(task).id === d) && !/^[A-Z]+\d+[a-z]*$/.test(d)).join(" ") || null,
      gateLine: latestGate ? gateLine(obj(latestGate.summary), failures) : /^G\d+$/i.test(str(row.gate) ?? "") ? null : str(row.gate),
      gateFailures: failures,
      lastFailedKind,
      rotations: roleHandovers.length,
    }];
  });

  const checkpoint = obj(root.current_checkpoint);
  const checkpointText = str(checkpoint.text);
  const lastJournal = arr(root.decision_journal).map(obj).filter((row) => str(row.decision)).at(-1);
  const orchestratorHandovers = handovers.filter((h) => h.role === "orchestrator");
  const last = orchestratorHandovers.at(-1);
  return {
    path,
    workflow: workflowEvents(data),
    goal: str(root.goal),
    status: str(root.status),
    statusRaw: str(root.status_raw),
    brief: str(root.brief),
    subtasks,
    forTheOwner: arr(root.for_the_owner).flatMap((line) => (typeof line === "string" && line.trim() ? [line] : [])),
    orchestratorSessions: orchestratorHandovers.length + 1,
    lastHandover: last ? { why: str(last.why), at: str(obj(last.time).at) } : null,
    warnings,
    checkpoint: checkpointText ? { text: checkpointText, at: str(obj(checkpoint.time).at) } : null,
    lastDecision: lastJournal ? { text: str(lastJournal.decision)!, at: str(obj(obj(lastJournal.when).time).at) } : null,
  };
}
