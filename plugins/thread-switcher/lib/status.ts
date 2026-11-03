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

export type StateCounts = Record<DotState, number>;

export function emptyCounts(): StateCounts {
  return { input: 0, error: 0, running: 0, done: 0 };
}

export function countTotal(counts: StateCounts): number {
  return counts.input + counts.error + counts.running + counts.done;
}

interface TreeThread extends StatusThread {
  id: string;
  parentThreadId: string | null;
  isArchived: boolean;
  isHidden: boolean;
}

/** Status counts of every visible descendant, keyed by ancestor id, as thread-tree's subthread line. */
export function subthreadCounts(threads: readonly TreeThread[]): Map<string, StateCounts> {
  const visible = threads.filter((thread) => !thread.isArchived && !thread.isHidden);
  const parentOf = new Map(visible.map((thread) => [thread.id, thread.parentThreadId]));
  const result = new Map<string, StateCounts>();
  for (const thread of visible) {
    const state = threadDotState(thread);
    const seen = new Set<string>();
    for (let parent = thread.parentThreadId; parent && !seen.has(parent); parent = parentOf.get(parent) ?? null) {
      seen.add(parent);
      const counts = result.get(parent) ?? emptyCounts();
      counts[state] += 1;
      result.set(parent, counts);
    }
  }
  return result;
}
