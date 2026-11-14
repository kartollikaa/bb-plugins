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
  hint,
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
  /** A key hint before the count. */
  hint?: string;
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
    <div data-drag-image className="group/header relative flex h-[26px] items-center gap-1 pl-2 pr-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="flex min-w-0 flex-1 items-center gap-[7px] self-stretch rounded-md text-left text-xs font-medium text-muted-foreground hover:text-sidebar-foreground"
      >
        <span className="flex w-3.5 shrink-0 items-center justify-center text-sidebar-foreground/50">{icon}</span>
        <span className={cn("min-w-0 truncate", summary && "shrink-0")}>{title}</span>
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
        ) : count !== null ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-2xs font-normal tabular-nums text-sidebar-foreground/45">
            {hint ? <kbd data-section-hint="" className="rounded border border-sidebar-border px-1 font-sans text-[10px] leading-3.5">{hint}</kbd> : null}
            <span data-section-count="">{count}</span>
          </span>
        ) : null}
      </button>
      {extra || action ? (
        <span data-header-actions="" className={HEADER_ACTIONS}>
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
        </span>
      ) : null}
    </div>
  );
  return menu && menu.length > 0 ? <HeaderMenu items={menu}>{header}</HeaderMenu> : header;
}

/** Hover controls overlay the summary over a fade, as thread rows do, so they never squeeze it; touch keeps them inline. */
const HEADER_ACTIONS = cn(
  "absolute inset-y-0 right-0 flex items-center gap-1 pl-6 pr-1.5 [background:linear-gradient(to_right,transparent,var(--row-base,var(--sidebar))_20px)]",
  "pointer-events-none opacity-0 transition-opacity duration-75 group-hover/header:pointer-events-auto group-hover/header:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
  "[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:static [@media(hover:none)]:bg-none [@media(hover:none)]:p-0 [@media(hover:none)]:opacity-100",
);

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
