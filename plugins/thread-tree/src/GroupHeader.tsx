import * as ContextMenu from "@radix-ui/react-context-menu";
import { Icon } from "@/components/ui/icon";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { cn } from "@/lib/utils";
import { TOUCH_DIMMED } from "./rowStyles";

export function GroupHeader({
  title,
  icon,
  isCollapsed,
  count,
  alwaysShowCount,
  onToggle,
  extra,
  action,
  menu,
}: {
  title: string;
  icon: React.ReactNode;
  isCollapsed: boolean;
  count: number;
  /** Keep the count visible while the group is expanded. */
  alwaysShowCount?: boolean;
  onToggle: () => void;
  /** Controls drawn before `action`, such as a menu trigger. */
  extra?: React.ReactNode;
  /** A button at the end of the header, shown on hover unless `alwaysVisible`. */
  action?: { label: string; icon: string; onClick: () => void; alwaysVisible?: boolean };
  /** Right-click menu on the header. */
  menu?: readonly HeaderMenuItem[];
}) {
  const header = (
    <div data-drag-image className="group/header flex h-7 items-center gap-1 px-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground"
      >
        <span className="flex w-4 shrink-0 items-center justify-center text-sidebar-foreground/50">{icon}</span>
        <span className="truncate">{title}</span>
        {isCollapsed || alwaysShowCount ? <span className="tabular-nums text-sidebar-foreground/40">{count}</span> : null}
        <Icon
          name="ChevronRight"
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-sidebar-foreground/40 opacity-0 transition-[opacity,transform] duration-75 group-hover/header:opacity-100",
            TOUCH_DIMMED,
            !isCollapsed && "rotate-90",
          )}
        />
      </button>
      {extra}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.label}
          title={action.label}
          className={cn(
            "flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            !action.alwaysVisible && ["opacity-0 focus-visible:opacity-100 group-hover/header:opacity-100", TOUCH_DIMMED],
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
