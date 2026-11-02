import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  experimental_useRpcQuery as useRpcQuery,
  useBbNavigate,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { rpcContract } from "@/lib/contract";
import { ATTENTION_LABEL, type Attention, type FolderItem, type FolderSettings, type SettingsPatch } from "@/lib/github";

const PULLS_URL = "https://github.com/pulls/review-requested";
const COLLAPSED_KEY = "bb-plugin-github-folder:collapsed";
const SHOW_SNOOZED_KEY = "bb-plugin-github-folder:show-snoozed";

const ATTENTION_STYLE: Record<Attention | "none", { short: string; className: string }> = {
  review: { short: "review", className: "text-blue-600 dark:text-blue-400" },
  changes_requested: { short: "changes", className: "text-red-600 dark:text-red-400" },
  ci_failed: { short: "CI", className: "text-red-600 dark:text-red-400" },
  conflicts: { short: "conflict", className: "text-red-600 dark:text-red-400" },
  ready: { short: "ready", className: "text-green-600 dark:text-green-400" },
  assigned: { short: "assigned", className: "text-muted-foreground" },
  mentioned: { short: "@you", className: "text-muted-foreground" },
  none: { short: "", className: "text-muted-foreground" },
};

function useStoredFlag(key: string): [boolean, () => void] {
  const [value, setValue] = useState(() => {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setValue((previous) => {
      try {
        window.localStorage.setItem(key, previous ? "0" : "1");
      } catch {
        // Storage blocked: the choice still applies for this session.
      }
      return !previous;
    });
  return [value, toggle];
}

function formatAge(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** The folder drawn with bb's own thread-list classes, so it reads as one more section of that list. */
export function FolderSection() {
  const { data, isLoading } = useRpcQuery({ contract: rpcContract, method: "folder", input: null });
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [isCollapsed, toggleCollapsed] = useStoredFlag(COLLAPSED_KEY);
  const [showSnoozed, toggleShowSnoozed] = useStoredFlag(SHOW_SNOOZED_KEY);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const report = (what: string) => (error: unknown) =>
    toast.error(what, { description: error instanceof Error ? error.message : String(error) });
  const update = (patch: SettingsPatch) => void rpc.call("updateSettings", patch).catch(report("Could not save the folder settings"));
  const snooze = (key: string, snoozed: boolean) => void rpc.call("snooze", { key, snoozed }).catch(report("Could not snooze"));
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);
  const startThread = (url: string) => {
    if (openingUrl !== null) return;
    setOpeningUrl(url);
    rpc
      .call("prContext", { url })
      .then(({ prompt, projectId }) =>
        navigate.toCompose({ initialPrompt: prompt, focusPrompt: true, ...(projectId ? { projectId } : {}) }),
      )
      .catch(report("Could not read the pull request"))
      .finally(() => setOpeningUrl(null));
  };
  const refresh = () => {
    setIsRefreshing(true);
    rpc
      .call("refresh", null)
      .catch(report("Could not refresh"))
      .finally(() => setIsRefreshing(false));
  };

  const items = data?.items ?? [];
  const snoozed = data?.snoozed ?? [];
  const rows = showSnoozed ? [...items, ...snoozed] : items;
  const now = Date.now();

  return (
    <section aria-label="GitHub pull requests" className="px-2 pb-1">
      <div className="group/gh-header flex h-7 shrink-0 items-center rounded-md pl-2 pr-0 text-xs font-normal leading-5 text-muted-foreground select-none">
        <span className="relative flex min-w-0 flex-1 items-center gap-1 text-left">
          <span className="min-w-0 truncate">GitHub</span>
          {isCollapsed && items.length > 0 ? <span className="tabular-nums text-subtle-foreground">{items.length}</span> : null}
          <button
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Expand GitHub section" : "Collapse GitHub section"}
            onClick={toggleCollapsed}
            className={cn(
              "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle-foreground outline-none hover:bg-state-hover hover:text-muted-foreground focus-visible:opacity-100",
              !isCollapsed && "opacity-0 group-hover/gh-header:opacity-100",
            )}
          >
            <Icon name="ChevronRight" aria-hidden className={cn("size-3 transition-transform duration-150", !isCollapsed && "rotate-90")} />
          </button>
        </span>
        <span className="inline-flex h-7 shrink-0 items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover/gh-header:opacity-100 has-[[data-state=open]]:opacity-100">
          {data ? (
            <CustomizeMenu
              settings={data.settings}
              orgs={data.orgs}
              accounts={data.accounts}
              fetchedAt={data.fetchedAt}
              isRefreshing={isRefreshing}
              onUpdate={update}
              onRefresh={refresh}
            />
          ) : null}
          <HeaderButton label="Open pull requests on GitHub" icon="ArrowUpRight" onClick={() => navigate.openUrl(PULLS_URL)} />
        </span>
      </div>
      {isCollapsed ? null : (
        <div role="list" className="relative space-y-0.5">
          {rows.map((item) => (
            <PullRequestRow
              key={item.pr.url}
              item={item}
              isSnoozed={snoozed.includes(item)}
              now={now}
              isOpening={openingUrl === item.pr.url}
              onOpen={(event) => (event.metaKey || event.ctrlKey ? navigate.openUrl(item.pr.url) : startThread(item.pr.url))}
              onOpenOnGithub={() => navigate.openUrl(item.pr.url)}
              onToggleSnooze={(value) => snooze(item.snoozeKey, value)}
            />
          ))}
          {isLoading || !data ? (
            <Note>Loading…</Note>
          ) : data.error !== null && items.length === 0 ? (
            <Note title={data.error}>Can’t reach GitHub: {data.error}</Note>
          ) : items.length === 0 && !showSnoozed ? (
            <Note>Nothing needs you</Note>
          ) : null}
          {snoozed.length > 0 ? (
            <button
              type="button"
              onClick={toggleShowSnoozed}
              className="h-6 rounded-md pl-8 pr-1 text-xs text-muted-foreground hover:text-sidebar-foreground"
            >
              {showSnoozed ? "Hide snoozed" : `${snoozed.length} snoozed`}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function HeaderButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle-foreground outline-none hover:bg-state-hover hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <Icon name={icon} aria-hidden className="size-3.5" />
    </button>
  );
}

function Note({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div title={title} className="flex h-7 items-center truncate pl-2 text-xs text-muted-foreground">
      <Icon name="GitPullRequest" aria-hidden className="mr-2 size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

function PullRequestRow({
  item,
  isSnoozed,
  now,
  isOpening,
  onOpen,
  onOpenOnGithub,
  onToggleSnooze,
}: {
  item: FolderItem;
  isSnoozed: boolean;
  now: number;
  isOpening: boolean;
  onOpen: (event: React.MouseEvent) => void;
  onOpenOnGithub: () => void;
  onToggleSnooze: (snoozed: boolean) => void;
}) {
  const { pr, attention } = item;
  const style = ATTENTION_STYLE[attention[0] ?? "none"];
  const tooltip = [
    `${pr.repo}#${pr.number} · ${pr.title}`,
    attention.map((reason) => ATTENTION_LABEL[reason]).join(", ") || "Your pull request",
    pr.isDraft ? "Draft" : "",
    `by @${pr.author} · updated ${formatAge(pr.updatedAt, now)} ago`,
    "Click: new thread about this PR · ⌘-click: open on GitHub",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      role="listitem"
      title={tooltip}
      onClick={onOpen}
      style={{ paddingLeft: 8 }}
      className={cn(
        "group/gh-row relative flex h-[var(--bb-sidebar-row-height)] w-full cursor-pointer select-none items-center gap-2 rounded-md pr-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-md:pointer-coarse:h-[var(--bb-sidebar-row-height-coarse)]",
        isSnoozed && "text-muted-foreground",
        isOpening && "cursor-progress opacity-60",
      )}
    >
      <span className={cn("mr-0.5 flex size-4 shrink-0 items-center justify-center", style.className)}>
        <Icon name={pr.isDraft ? "GitPullRequestDraft" : "GitPullRequest"} aria-hidden className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate whitespace-pre">{pr.title}</span>
      <span className={cn("shrink-0 text-xs group-hover/gh-row:hidden", style.className)}>
        {style.short || formatAge(pr.updatedAt, now)}
      </span>
      <span className="hidden shrink-0 items-center gap-1 group-hover/gh-row:flex">
        <span className="text-xs text-muted-foreground">#{pr.number}</span>
        <button
          type="button"
          aria-label="Open on GitHub"
          title="Open on GitHub"
          onClick={(event) => {
            event.stopPropagation();
            onOpenOnGithub();
          }}
          className="inline-flex size-6 items-center justify-center rounded-md text-subtle-foreground hover:bg-state-hover hover:text-muted-foreground"
        >
          <Icon name="ArrowUpRight" aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={isSnoozed ? "Unsnooze" : "Snooze until it changes"}
          title={isSnoozed ? "Unsnooze" : "Snooze until it changes"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSnooze(!isSnoozed);
          }}
          className="inline-flex size-6 items-center justify-center rounded-md text-subtle-foreground hover:bg-state-hover hover:text-muted-foreground"
        >
          <Icon name={isSnoozed ? "Eye" : "EyeOff"} aria-hidden className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

const SOURCE_ITEMS: readonly { source: keyof FolderSettings["sources"]; label: string }[] = [
  { source: "review", label: "Review requests" },
  { source: "author", label: "My pull requests" },
  { source: "assigned", label: "Assigned to me" },
  { source: "mentioned", label: "Mentions" },
];

const MENU_ITEM =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50";

function CheckItem({
  checked,
  onToggle,
  children,
  inset = false,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  inset?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.CheckboxItem
      checked={checked}
      disabled={disabled}
      onSelect={(event) => {
        event.preventDefault();
        onToggle();
      }}
      className={cn(MENU_ITEM, inset && "pl-7")}
    >
      <span className="flex size-3.5 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Icon name="Check" aria-hidden className="size-3.5" />
        </DropdownMenu.ItemIndicator>
      </span>
      <span className="flex-1">{children}</span>
    </DropdownMenu.CheckboxItem>
  );
}

function CustomizeMenu({
  settings,
  orgs,
  accounts,
  fetchedAt,
  isRefreshing,
  onUpdate,
  onRefresh,
}: {
  settings: FolderSettings;
  orgs: string[];
  accounts: string[];
  fetchedAt: number | null;
  isRefreshing: boolean;
  onUpdate: (patch: SettingsPatch) => void;
  onRefresh: () => void;
}) {
  const portalProps = usePortalScopeProps();
  const hiddenOrgs = new Set(settings.hiddenOrgs);
  const shownOrgs = orgs.filter((org) => !hiddenOrgs.has(org)).length;
  const toggleOrg = (org: string) =>
    onUpdate({
      hiddenOrgs: hiddenOrgs.has(org) ? settings.hiddenOrgs.filter((hidden) => hidden !== org) : [...settings.hiddenOrgs, org],
    });
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Customize the GitHub folder"
          title="Customize"
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle-foreground outline-none hover:bg-state-hover hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-state-active"
        >
          <Icon name="SlidersHorizontal" aria-hidden className="size-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          {...portalProps}
          align="end"
          sideOffset={4}
          className="z-50 min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.Label className="px-2 py-1 text-xs text-muted-foreground">Show</DropdownMenu.Label>
          {SOURCE_ITEMS.map(({ source, label }) => (
            <div key={source}>
              <CheckItem
                checked={settings.sources[source]}
                onToggle={() => onUpdate({ sources: { [source]: !settings.sources[source] } })}
              >
                {label}
              </CheckItem>
              {source === "review" ? (
                <CheckItem
                  inset
                  disabled={!settings.sources.review}
                  checked={settings.teamReviews}
                  onToggle={() => onUpdate({ teamReviews: !settings.teamReviews })}
                >
                  Include team requests
                </CheckItem>
              ) : null}
              {source === "author" ? (
                <CheckItem
                  inset
                  disabled={!settings.sources.author}
                  checked={settings.myPrs === "attention"}
                  onToggle={() => onUpdate({ myPrs: settings.myPrs === "attention" ? "all" : "attention" })}
                >
                  Only when they need me
                </CheckItem>
              ) : null}
            </div>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <CheckItem checked={settings.drafts} onToggle={() => onUpdate({ drafts: !settings.drafts })}>
            Include drafts
          </CheckItem>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={MENU_ITEM} disabled={orgs.length === 0}>
              <span className="flex size-3.5 items-center justify-center text-muted-foreground">
                <Icon name="Building2" aria-hidden className="size-3.5" />
              </span>
              <span className="flex-1">Organizations</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {shownOrgs === orgs.length ? "All" : `${shownOrgs}/${orgs.length}`}
              </span>
              <Icon name="ChevronRight" aria-hidden className="size-3.5 text-muted-foreground" />
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                {...portalProps}
                sideOffset={4}
                className="z-50 max-h-80 min-w-44 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
              >
                {orgs.map((org) => (
                  <CheckItem key={org} checked={!hiddenOrgs.has(org)} onToggle={() => toggleOrg(org)}>
                    {org}
                  </CheckItem>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            disabled={isRefreshing}
            onSelect={(event) => {
              event.preventDefault();
              onRefresh();
            }}
            className={MENU_ITEM}
          >
            <span className="flex size-3.5 items-center justify-center text-muted-foreground">
              <Icon name="RefreshCw" aria-hidden className={cn("size-3.5", isRefreshing && "animate-spin")} />
            </span>
            <span className="flex-1">Refresh</span>
            {fetchedAt !== null ? (
              <span className="text-xs text-muted-foreground">
                {formatAge(new Date(fetchedAt).toISOString(), Date.now())}
              </span>
            ) : null}
          </DropdownMenu.Item>
          {accounts.length > 0 ? (
            <div className="px-2 pb-1 pt-0.5 text-xs text-muted-foreground">
              {accounts.map((login) => `@${login}`).join(", ")}
            </div>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
