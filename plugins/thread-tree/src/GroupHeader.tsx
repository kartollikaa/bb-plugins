import * as ContextMenu from "@radix-ui/react-context-menu";
import { Icon } from "@/components/ui/icon";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { cn } from "@/lib/utils";
import { headerChevronMotion, TOUCH_DIMMED } from "./rowStyles";
import { useStill } from "./motion";
import { summarySeparator, type SummaryPart } from "./sectionSummaries";

export function GroupHeader({
  title,
  icon,
  isCollapsed,
  count,
  summary,
  onToggle,
  extra,
  action,
  menu,
}: {
  title: string;
  icon: React.ReactNode;
  isCollapsed: boolean;
  /** Right-aligned, collapsed or not; null draws none. */
  count: number | null;
  /** Replaces the count. */
  summary?: readonly SummaryPart[];
  onToggle: () => void;
  /** Controls drawn before `action`, such as a menu trigger. */
  extra?: React.ReactNode;
  /** A button at the end of the header, shown on hover. */
  action?: { label: string; icon: string; onClick: () => void };
  /** Right-click menu on the header. */
  menu?: readonly HeaderMenuItem[];
}) {
  const still = useStill();
  const header = (
    <div data-drag-image className="group/header flex h-[26px] items-center gap-1 pl-2 pr-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="flex min-w-0 flex-1 items-center gap-[7px] self-stretch rounded-md text-left text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground"
      >
        <span className="flex w-3.5 shrink-0 items-center justify-center text-sidebar-foreground/50">{icon}</span>
        <span className="min-w-0 truncate">{title}</span>
        <Icon
          name="ChevronRight"
          aria-hidden
          className={cn("size-3 shrink-0 opacity-60", headerChevronMotion(still), !isCollapsed && "rotate-90")}
        />
        {summary ? (
          <span
            data-section-summary=""
            title={summary.map((part) => part.text).join(" · ")}
            className="ml-auto flex min-w-0 shrink items-center gap-1.5 overflow-hidden whitespace-nowrap text-2xs font-normal tabular-nums text-sidebar-foreground/45"
          >
            {summary.map((part, index) => (
              <span key={part.text} className={cn("shrink-0", part.tone === "bad" && "text-red-600/90 dark:text-red-400/90", part.tone === "attention" && "text-amber-600 dark:text-amber-400")}>
                {summarySeparator(summary, index)}
                {part.text}
              </span>
            ))}
          </span>
        ) : count !== null && count !== undefined ? (
          <span data-section-count="" className="ml-auto shrink-0 text-2xs font-normal tabular-nums text-sidebar-foreground/45">{count}</span>
        ) : null}
      </button>
      {extra}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          title={action.label}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            "opacity-0 focus-visible:opacity-100 group-hover/header:opacity-100",
            TOUCH_DIMMED,
          )}
        >
          <Icon name={action.icon} aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
  return menu && menu.length > 0 ? <HeaderMenu items={menu}>{header}</HeaderMenu> : header;
}

export type HeaderMenuItem = { label: string; icon: string; onSelect: () => void };

function HeaderMenu({
  items,
  children,
}: {
  items: readonly HeaderMenuItem[];
  children: React.ReactNode;
}) {
  const portalProps = usePortalScopeProps();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          {...portalProps}
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {items.map((item) => (
            <ContextMenu.Item
              key={item.label}
              onSelect={item.onSelect}
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
            >
              <Icon name={item.icon} aria-hidden className="size-3.5 text-muted-foreground" />
              {item.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
