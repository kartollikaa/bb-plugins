/** Mirrors thread-tree's status dot, so both plugins show a thread the same way. */
export type DotState = "input" | "error" | "running" | "done";

export interface StatusThread {
  status: string;
  indicator: string;
  hasPendingInteraction: boolean;
  activity: { backgroundAgents: number; backgroundCommands: number; workflows: number };
}

const WORKING_INDICATORS = new Set(["runtime", "background-agent", "background-command", "workflow", "working-draft"]);

export function threadDotState(thread: StatusThread): DotState {
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input") return "input";
  if (thread.status === "error" || thread.indicator === "unread-error") return "error";
  if (isWorking(thread)) return "running";
  return "done";
}

function isWorking(thread: StatusThread): boolean {
  if (thread.status === "active" || thread.status === "starting") return true;
  const { backgroundAgents, backgroundCommands, workflows } = thread.activity;
  if (backgroundAgents > 0 || backgroundCommands > 0 || workflows > 0) return true;
  return WORKING_INDICATORS.has(thread.indicator);
}

export const DOT_LABEL: Record<DotState, string> = {
  input: "Needs your input",
  error: "Failed",
  running: "Working",
  done: "Done",
};

const URGENCY: Record<DotState, number> = { input: 0, error: 1, running: 2, done: 2 };

export function threadUrgency(thread: StatusThread): number {
  return URGENCY[threadDotState(thread)];
}
