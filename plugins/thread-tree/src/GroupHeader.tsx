import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function GroupHeader({
  title,
  icon,
  isCollapsed,
  count,
  onToggle,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  isCollapsed: boolean;
  count: number;
  onToggle: () => void;
  /** A hover button at the end of the header. */
  action?: { label: string; icon: string; onClick: () => void };
}) {
  return (
    <div className="group/header flex h-7 items-center gap-1 px-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground"
      >
        <span className="flex w-4 shrink-0 items-center justify-center text-sidebar-foreground/50">{icon}</span>
        <span className="truncate">{title}</span>
        {isCollapsed ? <span className="tabular-nums text-sidebar-foreground/40">{count}</span> : null}
        <Icon
          name="ChevronRight"
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-sidebar-foreground/40 opacity-0 transition group-hover/header:opacity-100",
            !isCollapsed && "rotate-90",
          )}
        />
      </button>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          title={action.label}
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 opacity-0 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/header:opacity-100"
        >
          <Icon name={action.icon} aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
