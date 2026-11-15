import type { LedgerSummary } from "./contract.ts";
import type { Row } from "./view.ts";

export interface Phase {
  kind: "blocked" | "paused" | "closed" | "inconsistent" | "running" | "gate" | "waiting" | "wrapping" | "planning" | "unknown";
  label: string;
  detail: string | null;
}

export function orchestrationPhase(ledger: LedgerSummary, rows: Row[], orchestratorRunning: boolean): Phase {
  const state = ledger.status?.toLowerCase();
  const running = rows.some((r) => r.running) || orchestratorRunning;
  const unfinished = rows.some((r) => r.kind !== "done");
  const detail = ledger.statusRaw ?? null;
  if (state === "closed" && (running || unfinished)) return { kind: "inconsistent", label: "Closed, but work is still open", detail: "The recorded closure conflicts with unfinished tasks or live activity." };
  if (state === "blocked") return { kind: "blocked", label: "Orchestration blocked", detail };
  if (state === "paused") return { kind: "paused", label: "Orchestration paused", detail };
  if (state === "closed") return { kind: "closed", label: "Orchestration completed", detail };
  if (rows.some((r) => r.kind === "stuck")) return { kind: "blocked", label: "Work is blocked", detail };
  if (running) return { kind: "running", label: "Work in progress", detail };
  if (rows.length && !unfinished) return { kind: "wrapping", label: "Tasks finished · awaiting closure", detail };
  const waitingOnOwner = new Set(rows.filter((r) => r.kind === "you").map((r) => r.id));
  if (ledger.subtasks.some((s) => ["delivered", "gate"].includes(s.status ?? "") && !waitingOnOwner.has(s.id))) return { kind: "gate", label: "Waiting for verification or landing", detail };
  if (!rows.length || ledger.subtasks.every((s) => s.status === "planned")) return { kind: "planning", label: "Planning the work", detail };
  if (!state || !["active", "blocked", "paused", "closed"].includes(state)) return { kind: "unknown", label: "Orchestration state unknown", detail };
  return { kind: "waiting", label: "Waiting · no agent running", detail };
}
