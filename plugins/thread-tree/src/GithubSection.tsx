import { useCallback, useEffect, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { useTapToOpenMenu } from "./useTapToOpenMenu";
import type { rpcContract } from "../server";
import {
  ATTENTION_LABEL,
  type GithubFolderItem,
  type GithubFolderView,
  type GithubSettings,
  type GithubSettingsPatch,
  prOpenTarget,
} from "./githubFolder";
import { GroupHeader, type HeaderMenuItem } from "./GroupHeader";
import { ROW_HOVER_SOLID_BG, ROW_TINT, TOUCH_DIMMED } from "./rowStyles";
import { formatAge } from "./time";
import { Collapse } from "./Collapse";
import { pullRequestLook, pullRequestSummary } from "./sectionSummaries";
import { PullRequestActionIcon, type PullRequestActionHandlers } from "./usePullRequestActions";

const POLL_MS = 60_000;

/** `toPluginPanel` only reaches this plugin's own panels, so GitHub Folder's page goes through the router's history. */
export function openGithubFolderPrPage(url: string) {
  const target = prOpenTarget(url);
  if (!target) {
    toast.error("Can't open this pull request", { description: url });
    return;
  }
  if (target.kind === "tab") {
    window.open(target.url, "_blank", "noopener");
    return;
  }
  window.history.pushState(window.history.state, "", target.path);
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}
const PULLS_URL = "https://github.com/pulls/review-requested";

/** The GitHub Folder plugin's view; null while loading or when that plugin is absent. */
export function useGithubFolder() {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<{ view: GithubFolderView | null } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const load = useCallback(
    (refresh: boolean) =>
      rpc.call("githubFolder", { refresh }).then(({ view, failed }) => {
        if (!failed) setState({ view });
      }, () => undefined),
    [rpc],
  );
  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(false), POLL_MS);
    const onFocus = () => void load(false);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const report = (what: string) => (error: unknown) =>
    toast.error(what, { description: error instanceof Error ? error.message : String(error) });
  return {
    view: state?.view ?? null,
    isLoaded: state !== null,
    isRefreshing,
    refresh: () => {
      setIsRefreshing(true);
      load(true).finally(() => setIsRefreshing(false));
    },
    update: (patch: GithubSettingsPatch) =>
      void rpc.call("githubFolderUpdate", patch).then(() => load(false), report("Could not save the folder settings")),
    snooze: (key: string, snoozed: boolean) =>
      void rpc.call("githubFolderSnooze", { key, snoozed }).then(() => load(false), report("Could not snooze")),
    prefetch: (url: string) => void rpc.call("githubFolderPrefetch", { url }).catch(() => undefined),
  };
}

type GithubFolder = ReturnType<typeof useGithubFolder>;

export function GithubSection({
  isCollapsed,
  onToggle,
  menu,
  showSnoozed,
  onToggleSnoozed,
  folder,
  threadOfPullRequest,
  pullRequestActions,
  onOpenThread,
}: {
  folder: GithubFolder;
  threadOfPullRequest: ReadonlyMap<string, string>;
  pullRequestActions: PullRequestActionHandlers;
  onOpenThread: (threadId: string, split: boolean) => void;
  isCollapsed: boolean;
  onToggle: () => void;
  /** The header's right-click menu. */
  menu?: readonly HeaderMenuItem[];
  showSnoozed: boolean;
  onToggleSnoozed: () => void;
}) {
  const { view, isRefreshing, refresh, update, snooze, prefetch } = folder;
  const navigate = useBbNavigate();
  if (!view) return null;

  const now = Date.now();
  const rows = showSnoozed ? [...view.items, ...view.snoozed] : view.items;

  return (
    <section aria-label="Pull requests">
      <GroupHeader
        title="Pull requests"
        icon={<Icon name="Github" aria-hidden className="size-3.5" />}
        isCollapsed={isCollapsed}
        count={view.items.length}
        summary={pullRequestSummary(view.items)}
        onToggle={onToggle}
        extra={
          <CustomizeMenu
            settings={view.settings}
            orgs={view.orgs}
            accounts={view.accounts}
            fetchedAt={view.fetchedAt}
            isRefreshing={isRefreshing}
            onUpdate={update}
            onRefresh={refresh}
          />
        }
        menu={menu}
        action={{ label: "Open pull requests on GitHub", icon: "ArrowUpRight", onClick: () => navigate.openUrl(PULLS_URL) }}
      />
      <Collapse open={!isCollapsed}>
        <div role="list" className="mt-0.5 flex flex-col gap-0.5">
          {rows.map((item) => {
            const threadId = threadOfPullRequest.get(item.pr.url.toLowerCase());
            return (
            <PullRequestRow
              key={item.pr.url}
              item={item}
              onOpenThread={threadId ? (split) => onOpenThread(threadId, split) : undefined}
              action={(className) => (
                <PullRequestActionIcon
                  pr={{ url: item.pr.url, number: item.pr.number, title: item.pr.title, repo: item.pr.repo, attention: item.attention, threadId: threadId ?? null }}
                  handlers={pullRequestActions}
                  className={className}
                />
              )}
              isSnoozed={view.snoozed.includes(item)}
              now={now}
              onHover={() => prefetch(item.pr.url)}
              onOpen={() => openGithubFolderPrPage(item.pr.url)}
              onOpenOnGithub={() => navigate.openUrl(item.pr.url)}
              onToggleSnoozed={(snoozed) => snooze(item.snoozeKey, snoozed)}
            />
            );
          })}
          {view.error !== null && view.items.length === 0 ? (
            <Note title={view.error}>Can’t reach GitHub: {view.error}</Note>
          ) : view.fetchedAt === null ? (
            <Note>Loading…</Note>
          ) : view.items.length === 0 && !showSnoozed ? (
            <Note>Nothing needs you</Note>
          ) : null}
          {view.snoozed.length > 0 ? (
            <button
              type="button"
              onClick={onToggleSnoozed}
              className="ml-[26px] h-6 self-start rounded-md px-1 text-xs text-sidebar-foreground/45 hover:text-sidebar-foreground"
            >
              {showSnoozed ? "Hide snoozed" : `${view.snoozed.length} snoozed`}
            </button>
          ) : null}
        </div>
      </Collapse>
    </section>
  );
}

function Note({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div title={title} className="ml-[26px] truncate px-1 py-0.5 text-xs text-sidebar-foreground/45">
      {children}
    </div>
  );
}

function PullRequestRow({
  item,
  isSnoozed,
  now,
  onHover,
  onOpen,
  onOpenOnGithub,
  onOpenThread,
  action,
  onToggleSnoozed,
}: {
  item: GithubFolderItem;
  onOpenThread?: (split: boolean) => void;
  action: (className: string) => React.ReactNode;
  isSnoozed: boolean;
  now: number;
  onHover: () => void;
  onOpen: () => void;
  onOpenOnGithub: () => void;
  onToggleSnoozed: (snoozed: boolean) => void;
}) {
  const { pr, attention } = item;
  const look = pullRequestLook(item);
  const tooltip = [
    `${pr.repo}#${pr.number} · ${pr.title}`,
    attention.map((reason) => ATTENTION_LABEL[reason]).join(", ") || look.label,
    pr.isDraft && look.reason !== null ? "Draft" : "",
    `by @${pr.author} · updated ${formatAge(Date.parse(pr.updatedAt), now)} ago`,
    "Click: new thread about this PR · ⌘-click or middle-click: open on GitHub",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      role="listitem"
      title={tooltip}
      onClick={(event) => (event.metaKey || event.ctrlKey ? onOpenOnGithub() : onOpen())}
      onPointerEnter={onHover}
      onAuxClick={(event) => {
        if (event.button === 1) onOpenOnGithub();
      }}
      className={cn(
        "group/row relative flex h-8 cursor-default items-center gap-2 rounded-md pl-1.5 pr-2 text-sm text-sidebar-foreground/90",
        ROW_TINT,
        isSnoozed && "text-sidebar-foreground/50",
      )}
    >
      <span data-pr-reason={look.reason ?? "none"} className={cn("flex size-4 shrink-0 items-center justify-center", look.className)}>
        <Icon name={look.icon} fallback="GitPullRequest" aria-label={look.label} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">{pr.title}</span>
      <span data-pr-repo="" className="max-w-[30%] shrink-0 truncate text-2xs text-sidebar-foreground/45 group-hover/row:invisible">
        {pr.repo.split("/")[1] ?? pr.repo}
      </span>
      <span
        onAuxClick={(event) => event.stopPropagation()}
        className={cn("absolute inset-y-0 right-1 hidden items-center gap-0.5 pl-2 group-hover/row:flex", ROW_HOVER_SOLID_BG)}
      >
        {onOpenThread ? (
          <button
            type="button"
            aria-label="Open its thread"
            title="Open its thread"
            onClick={(event) => {
              event.stopPropagation();
              onOpenThread(event.metaKey || event.ctrlKey);
            }}
            className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Icon name="MessageSquare" fallback="ArrowUpRight" aria-hidden className="size-3.5" />
          </button>
        ) : null}
        {action(STRIP_BUTTON)}
        <button
          type="button"
          aria-label="Open on GitHub"
          title="Open on GitHub"
          onClick={(event) => {
            event.stopPropagation();
            onOpenOnGithub();
          }}
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Icon name="ArrowUpRight" aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={isSnoozed ? "Unsnooze" : "Snooze until it changes"}
          title={isSnoozed ? "Unsnooze" : "Snooze until it changes"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSnoozed(!isSnoozed);
          }}
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Icon name={isSnoozed ? "Eye" : "EyeOff"} aria-hidden className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

const STRIP_BUTTON = "flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-60";

const SOURCE_ITEMS: readonly { source: keyof GithubSettings["sources"]; label: string }[] = [
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
  settings: GithubSettings;
  orgs: string[];
  accounts: string[];
  fetchedAt: number | null;
  isRefreshing: boolean;
  onUpdate: (patch: GithubSettingsPatch) => void;
  onRefresh: () => void;
}) {
  const portalProps = usePortalScopeProps();
  const menu = useTapToOpenMenu();
  const hiddenOrgs = new Set(settings.hiddenOrgs);
  const shownOrgs = orgs.filter((org) => !hiddenOrgs.has(org)).length;
  const toggleOrg = (org: string) =>
    onUpdate({
      hiddenOrgs: hiddenOrgs.has(org) ? settings.hiddenOrgs.filter((hidden) => hidden !== org) : [...settings.hiddenOrgs, org],
    });
  return (
    <DropdownMenu.Root {...menu.rootProps}>
      <DropdownMenu.Trigger asChild {...menu.triggerProps}>
        <button
          type="button"
          aria-label="Customize the GitHub folder"
          title="Customize"
          className={`flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 opacity-0 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/header:opacity-100 data-[state=open]:bg-sidebar-accent data-[state=open]:opacity-100 ${TOUCH_DIMMED}`}
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
            {fetchedAt !== null ? <span className="text-xs text-muted-foreground">{formatAge(fetchedAt, Date.now())}</span> : null}
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
