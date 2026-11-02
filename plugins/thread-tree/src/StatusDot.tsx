import { cn } from "@/lib/utils";
import type { SubagentState } from "./subagents";
import type { DotState } from "./tree";

// bb's theme has no blue status token, so running uses Tailwind's palette.
const DOT_CLASS: Record<DotState, string> = {
  running: "bg-blue-500 animate-pulse",
  input: "bg-attention",
  error: "bg-destructive",
  done: "bg-success",
  stopped: "bg-muted-foreground/40",
};

const SUBAGENT_DOT: Record<SubagentState, DotState> = {
  running: "running",
  completed: "done",
  failed: "error",
  stopped: "stopped",
};

export function subagentDot(state: SubagentState): DotState {
  return SUBAGENT_DOT[state];
}

export function StatusDot({ state, className }: { state: DotState; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", DOT_CLASS[state], className)} />;
}
