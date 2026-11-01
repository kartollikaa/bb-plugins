import * as HoverCard from "@radix-ui/react-hover-card";
import { usePortalScopeProps } from "@/lib/portal-scope";
import type { SubagentState } from "./subagents";
import { effectiveState, summarize, type TreeThread } from "./tree";
import type { ThreadSubagents } from "./useSubagents";
import { formatDuration } from "./time";
import { StatusDot, subagentDot } from "./StatusDot";

const STATE_LABEL: Record<SubagentState, string> = {
  running: "Running",
  completed: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

export function SubagentBadge({ thread, data }: { thread: TreeThread; data: ThreadSubagents | undefined }) {
  const portalProps = usePortalScopeProps();
  if (!data || data.total === 0) return null;
  const summary = summarize(data.total, data.subagents, thread);
  const label =
    `${summary.total} subagent${summary.total === 1 ? "" : "s"}` +
    (summary.running > 0 ? `, ${summary.running} running` : "") +
    (summary.failed > 0 ? `, ${summary.failed} failed` : "");
  const now = Date.now();

  return (
    <HoverCard.Root openDelay={250} closeDelay={80}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
          className="flex h-4 shrink-0 items-center gap-1 rounded-full px-1.5 text-2xs leading-none tabular-nums text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <StatusDot state={summary.dot} />
          {summary.running > 0 ? `${summary.running}/${summary.total}` : summary.total}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          {...portalProps}
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="z-50 w-80 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <div className="px-1.5 pb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
          <ul className="max-h-80 overflow-y-auto">
            {data.subagents.map((agent) => {
              const state = effectiveState(agent, thread);
              const duration = formatDuration((agent.endedAt ?? now) - agent.startedAt);
              const meta = [
                agent.agentType,
                agent.background ? "background" : null,
                STATE_LABEL[state],
                duration,
                agent.totalTokens ? `${Math.round(agent.totalTokens / 1000)}k tok` : null,
              ].filter(Boolean);
              return (
                <li key={agent.id} className="flex items-start gap-2 rounded-md px-1.5 py-1">
                  <StatusDot state={subagentDot(state)} className="mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm" title={agent.label}>
                      {agent.label}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          {data.total > data.subagents.length ? (
            <div className="px-1.5 pt-1 text-xs text-muted-foreground">
              {data.total - data.subagents.length} older not shown
            </div>
          ) : null}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
