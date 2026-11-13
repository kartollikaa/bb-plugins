import { useCallback, useEffect, useState } from "react";
import {
  experimental_useSidebarNavigation as useSidebarNavigation,
  useBbNavigate,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { rpcContract } from "../server";
import { automationDot, sortAutomations, type AutomationAction, type AutomationSummary } from "./automations";
import { GroupHeader, type HeaderMenuItem } from "./GroupHeader";
import { ROW_HOVER_SOLID_BG, ROW_TINT } from "./rowStyles";
import { StatusDot } from "./StatusDot";
import { formatUntil } from "./time";
import { Collapse } from "./Collapse";

const POLL_MS = 30_000;
const AUTOMATIONS_NAV_ITEM = "__bb__/automations";

function useAutomations() {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<{ available: boolean; automations: AutomationSummary[] } | null>(null);
  const refresh = useCallback(() => {
    rpc.call("automations", null).then(setState, () => setState((previous) => previous));
  }, [rpc]);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return { state, refresh, rpc };
}

export function AutomationsSection({
  isCollapsed,
  onToggle,
  menu,
  showPaused,
  onTogglePaused,
  activeThreadId,
  now,
  onNavigate,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
  /** The header's right-click menu. */
  menu?: readonly HeaderMenuItem[];
  showPaused: boolean;
  onTogglePaused: () => void;
  activeThreadId: string | null;
  now: number;
  onNavigate: () => void;
}) {
  const { state, refresh, rpc } = useAutomations();
  const navigate = useBbNavigate();
  const { actions } = useSidebarNavigation();
  const openAutomationsPage = () => {
    actions.activate(AUTOMATIONS_NAV_ITEM, { target: "current" });
    onNavigate();
  };

  if (!state?.available || state.automations.length === 0) return null;
  const sorted = sortAutomations(state.automations);
  const active = sorted.filter((automation) => automation.enabled);
  const paused = sorted.filter((automation) => !automation.enabled);
  const shown = showPaused ? sorted : active;

  const act = async (automation: AutomationSummary, action: AutomationAction) => {
    try {
      await rpc.call("automationAction", { projectId: automation.projectId, automationId: automation.id, action });
      if (action === "run") toast.success(`Started “${automation.name}”`);
    } catch (error) {
      toast.error(`Could not ${action} “${automation.name}”`, {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      refresh();
    }
  };

  return (
    <section aria-label="Automations">
      <GroupHeader
        title="Automations"
        icon={<Icon name="Zap" aria-hidden className="size-3.5" />}
        isCollapsed={isCollapsed}
        count={active.length}
        alwaysShowCount
        onToggle={onToggle}
        menu={menu}
        action={{ label: "Open Automations", icon: "ArrowUpRight", onClick: openAutomationsPage }}
      />
      <Collapse open={!isCollapsed}>
        <div role="list" className="mt-0.5 flex flex-col gap-0.5">
          {shown.map((automation) => (
            <AutomationRow
              key={automation.id}
              automation={automation}
              isActive={automation.lastRunThreadId !== null && automation.lastRunThreadId === activeThreadId}
              now={now}
              onOpen={() => {
                if (automation.lastRunThreadId) {
                  navigate.toThread(automation.lastRunThreadId);
                  onNavigate();
                } else {
                  openAutomationsPage();
                }
              }}
              onAction={(action) => void act(automation, action)}
            />
          ))}
          {paused.length > 0 ? (
            <button
              type="button"
              onClick={onTogglePaused}
              className="ml-[26px] h-6 self-start rounded-md px-1 text-xs text-sidebar-foreground/45 hover:text-sidebar-foreground"
            >
              {showPaused ? "Hide paused" : `${paused.length} paused`}
            </button>
          ) : null}
        </div>
      </Collapse>
    </section>
  );
}

function AutomationRow({
  automation,
  isActive,
  now,
  onOpen,
  onAction,
}: {
  automation: AutomationSummary;
  isActive: boolean;
  now: number;
  onOpen: () => void;
  onAction: (action: AutomationAction) => void;
}) {
  const dot = automationDot(automation);
  const when =
    dot === "running"
      ? "running"
      : !automation.enabled
        ? "paused"
        : automation.nextRunAt
          ? formatUntil(automation.nextRunAt, now)
          : "";
  const tooltip = [automation.name, automation.projectName, automation.lastError].filter(Boolean).join(" · ");
  return (
    <div
      role="listitem"
      title={tooltip}
      onClick={onOpen}
      className={cn(
        "group/row relative flex h-8 cursor-default items-center gap-2 rounded-md pl-1.5 pr-2 text-sm text-sidebar-foreground/90",
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ROW_TINT,
        !automation.enabled && "text-sidebar-foreground/55",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <StatusDot state={dot} className="size-2" />
      </span>
      <span className="min-w-0 flex-1 truncate">{automation.name}</span>
      <span className="shrink-0 text-2xs tabular-nums text-sidebar-foreground/45 group-hover/row:invisible">{when}</span>
      <span
        className={cn(
          "absolute inset-y-0 right-1 hidden items-center gap-0.5 pl-2 group-hover/row:flex",
          isActive ? "bg-sidebar-accent" : ROW_HOVER_SOLID_BG,
        )}
      >
          <RowButton label="Run now" icon="Play" onClick={() => onAction("run")} />
          <RowButton
            label={automation.enabled ? "Pause" : "Resume"}
            icon={automation.enabled ? "Pause" : "Repeat"}
            onClick={() => onAction(automation.enabled ? "pause" : "resume")}
          />
      </span>
    </div>
  );
}

function RowButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <Icon name={icon} aria-hidden className="size-3.5" />
    </button>
  );
}
