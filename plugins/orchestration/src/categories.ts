export type WorkCategory = "Active" | "Idle / waiting" | "Planned" | "Done";

export function workCategory(status: string | null, running: boolean, needsInput: boolean): WorkCategory {
  if (running || needsInput) return "Active";
  if (["landed", "verified", "dropped"].includes(status ?? "")) return "Done";
  if (["planned", "waiting-dependency"].includes(status ?? "")) return "Planned";
  return "Idle / waiting";
}

export const WORK_CATEGORIES: WorkCategory[] = ["Active", "Idle / waiting", "Planned", "Done"];
