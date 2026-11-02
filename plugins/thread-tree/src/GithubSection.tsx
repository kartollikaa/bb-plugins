import { useCallback, useEffect, useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { usePortalScopeProps } from "@/lib/portal-scope";
import type { rpcContract } from "../server";
import {
  ATTENTION_LABEL,
  DEFAULT_SOURCES,
  buildFolder,
  hideKey,
  type Attention,
  type FolderItem,
  type FolderSettings,
  type GithubPr,
  type PrSource,
} from "./github";
import { GroupHeader } from "./GroupHeader";
import { ROW_HOVER_SOLID_BG } from "./rowStyles";
import { formatAge } from "./time";
import { usePersistentSet } from "./usePersistentSet";

const POLL_MS = 120_000;
const PULLS_URL = "https://github.com/pulls/review-requested";

interface Snapshot {
  accounts: string[];
  prs: GithubPr[];
  error: string | null;
  fetchedAt: number;
}

function useGithubPrs() {
  const rpc = useRpc<typeof rpcContract>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const refresh = useCallback(
    (force = false) => {
      setIsLoading(true);
      rpc
        .call("githubPrs", { force })
        .then(setSnapshot, (error: unknown) =>
          setSnapshot((previous) => ({
            accounts: previous?.accounts ?? [],
            prs: previous?.prs ?? [],
            error: error instanceof Error ? error.message : String(error),
            fetchedAt: Date.now(),
          })),
        )
        .finally(() => setIsLoading(false));
    },
    [rpc],
  );
  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh(), POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  return { snapshot, isLoading, refresh };
}

/** Keys stored in the flags set mean "the opposite of the default". */
const FLAG_DEFAULTS = {
  "source:review": DEFAULT_SOURCES.review,
  "source:author": DEFAULT_SOURCES.author,
  "source:assigned": DEFAULT_SOURCES.assigned,
  "source:mentioned": DEFAULT_SOURCES.mentioned,
  "my-prs-all": false,
  "team-reviews": true,
  drafts: true,
  "show-hidden": false,
} as const;
type Flag = keyof typeof FLAG_DEFAULTS;

function useFolderSettings() {
  const flags = usePersistentSet("github-flags");
  const hiddenOrgs = usePersistentSet("github-hidden-orgs");
  const hiddenPrs = usePersistentSet("github-hidden-prs");
  const isOn = useCallback((flag: Flag) => FLAG_DEFAULTS[flag] !== flags.has(flag), [flags]);
  const settings = useMemo<FolderSettings>(
    () => ({
      sources: {
        review: isOn("source:review"),
        author: isOn("source:author"),
        assigned: isOn("source:assigned"),
        mentioned: isOn("source:mentioned"),
      },
      myPrs: isOn("my-prs-all") ? "all" : "attention",
      teamReviews: isOn("team-reviews"),
      drafts: isOn("drafts"),
      hiddenOrgs: hiddenOrgs.values,
      hiddenPrs: hiddenPrs.values,
    }),
    [isOn, hiddenOrgs.values, hiddenPrs.values],
  );
  return { settings, isOn, toggle: (flag: Flag) => flags.toggle(flag), hiddenOrgs, hiddenPrs };
}

const ATTENTION_STYLE: Record<Attention | "none", { short: string; className: string }> = {
  review: { short: "review", className: "text-blue-600 dark:text-blue-400" },
  changes_requested: { short: "changes", className: "text-red-600 dark:text-red-400" },
  ci_failed: { short: "CI", className: "text-red-600 dark:text-red-400" },
  conflicts: { short: "conflict", className: "text-red-600 dark:text-red-400" },
  ready: { short: "ready", className: "text-green-600 dark:text-green-400" },
  assigned: { short: "assigned", className: "text-sidebar-foreground/60" },
  mentioned: { short: "@you", className: "text-sidebar-foreground/60" },
  none: { short: "", className: "text-sidebar-foreground/45" },
};

export function GithubSection({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  const { snapshot, isLoading, refresh } = useGithubPrs();
  const { settings, isOn, toggle, hiddenOrgs, hiddenPrs } = useFolderSettings();
  const navigate = useBbNavigate();
  const folder = useMemo(() => buildFolder(snapshot?.prs ?? [], settings), [snapshot, settings]);
  const showHidden = isOn("show-hidden");

  useEffect(() => {
    if (!snapshot || snapshot.error !== null) return;
    const live = new Set(snapshot.prs.map(hideKey));
    const stale = [...hiddenPrs.values].filter((key) => !live.has(key));
    if (stale.length > 0) hiddenPrs.remove(stale);
  }, [snapshot, hiddenPrs]);

  const now = Date.now();
  const rows = showHidden ? [...folder.items, ...folder.hidden] : folder.items;

  return (
    <section aria-label="GitHub pull requests">
      <GroupHeader
        title="GitHub"
        icon={<Icon name="Github" aria-hidden className="size-3.5" />}
        isCollapsed={isCollapsed}
        count={folder.items.length}
        onToggle={onToggle}
        extra={
          <CustomizeMenu
            isOn={isOn}
            toggle={toggle}
            orgs={folder.orgs}
            hiddenOrgs={hiddenOrgs.values}
            onToggleOrg={hiddenOrgs.toggle}
            accounts={snapshot?.accounts ?? []}
            fetchedAt={snapshot?.fetchedAt ?? null}
            isLoading={isLoading}
            onRefresh={() => refresh(true)}
          />
        }
        action={{ label: "Open pull requests on GitHub", icon: "ArrowUpRight", onClick: () => navigate.openUrl(PULLS_URL) }}
      />
      {isCollapsed ? null : (
        <div role="list" className="mt-0.5 flex flex-col gap-0.5">
          {rows.map((item) => {
            const key = hideKey(item.pr);
            const isHidden = hiddenPrs.has(key);
            return (
              <PullRequestRow
                key={item.pr.url}
                item={item}
                isHidden={isHidden}
                now={now}
                onOpen={() => navigate.openUrl(item.pr.url)}
                onToggleHidden={() => hiddenPrs.toggle(key)}
              />
            );
          })}
          {snapshot === null ? (
            <Note>Loading…</Note>
          ) : snapshot.error !== null && snapshot.prs.length === 0 ? (
            <Note title={snapshot.error}>Can’t reach GitHub: {snapshot.error}</Note>
          ) : folder.items.length === 0 && !showHidden ? (
            <Note>Nothing needs you</Note>
          ) : null}
          {folder.hidden.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle("show-hidden")}
              className="ml-[26px] h-6 self-start rounded-md px-1 text-xs text-sidebar-foreground/45 hover:text-sidebar-foreground"
            >
              {showHidden ? "Hide snoozed" : `${folder.hidden.length} snoozed`}
            </button>
          ) : null}
        </div>
      )}
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
  isHidden,
  now,
  onOpen,
  onToggleHidden,
}: {
  item: FolderItem;
  isHidden: boolean;
  now: number;
  onOpen: () => void;
  onToggleHidden: () => void;
}) {
  const { pr, attention } = item;
  const style = ATTENTION_STYLE[attention[0] ?? "none"];
  const tooltip = [
    `${pr.repo}#${pr.number} · ${pr.title}`,
    attention.map((reason) => ATTENTION_LABEL[reason]).join(", ") || "Your pull request",
    pr.isDraft ? "Draft" : "",
    `by @${pr.author} · updated ${formatAge(Date.parse(pr.updatedAt), now)} ago`,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <div
      role="listitem"
      title={tooltip}
      onClick={onOpen}
      onAuxClick={(event) => {
        if (event.button === 1) onOpen();
      }}
      className={cn(
        "group/row relative flex h-8 cursor-default items-center gap-2 rounded-md pl-1.5 pr-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent/60",
        isHidden && "text-sidebar-foreground/50",
      )}
    >
      <span className={cn("flex size-4 shrink-0 items-center justify-center", style.className)}>
        <Icon name={pr.isDraft ? "GitPullRequestDraft" : "GitPullRequest"} aria-hidden className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate">{pr.title}</span>
      <span className={cn("shrink-0 text-2xs group-hover/row:invisible", style.className)}>
        {style.short || formatAge(Date.parse(pr.updatedAt), now)}
      </span>
      <span className={cn("absolute inset-y-0 right-1 hidden items-center gap-0.5 pl-2 group-hover/row:flex", ROW_HOVER_SOLID_BG)}>
        <span className="text-2xs text-sidebar-foreground/45">
          {pr.repo.split("/")[1]}#{pr.number}
        </span>
        <button
          type="button"
          aria-label={isHidden ? "Unsnooze" : "Snooze until it changes"}
          title={isHidden ? "Unsnooze" : "Snooze until it changes"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleHidden();
          }}
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Icon name={isHidden ? "Eye" : "EyeOff"} aria-hidden className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

const SOURCE_ITEMS: readonly { source: PrSource; label: string }[] = [
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
  isOn,
  toggle,
  orgs,
  hiddenOrgs,
  onToggleOrg,
  accounts,
  fetchedAt,
  isLoading,
  onRefresh,
}: {
  isOn: (flag: Flag) => boolean;
  toggle: (flag: Flag) => void;
  orgs: string[];
  hiddenOrgs: ReadonlySet<string>;
  onToggleOrg: (org: string) => void;
  accounts: string[];
  fetchedAt: number | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const portalProps = usePortalScopeProps();
  const shownOrgs = orgs.filter((org) => !hiddenOrgs.has(org)).length;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Customize the GitHub folder"
          title="Customize"
          className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 opacity-0 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/header:opacity-100 data-[state=open]:bg-sidebar-accent data-[state=open]:opacity-100"
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
              <CheckItem checked={isOn(`source:${source}`)} onToggle={() => toggle(`source:${source}`)}>
                {label}
              </CheckItem>
              {source === "review" ? (
                <CheckItem
                  inset
                  disabled={!isOn("source:review")}
                  checked={isOn("team-reviews")}
                  onToggle={() => toggle("team-reviews")}
                >
                  Include team requests
                </CheckItem>
              ) : null}
              {source === "author" ? (
                <CheckItem
                  inset
                  disabled={!isOn("source:author")}
                  checked={!isOn("my-prs-all")}
                  onToggle={() => toggle("my-prs-all")}
                >
                  Only when they need me
                </CheckItem>
              ) : null}
            </div>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <CheckItem checked={isOn("drafts")} onToggle={() => toggle("drafts")}>
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
                  <CheckItem key={org} checked={!hiddenOrgs.has(org)} onToggle={() => onToggleOrg(org)}>
                    {org}
                  </CheckItem>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            disabled={isLoading}
            onSelect={(event) => {
              event.preventDefault();
              onRefresh();
            }}
            className={MENU_ITEM}
          >
            <span className="flex size-3.5 items-center justify-center text-muted-foreground">
              <Icon name="RefreshCw" aria-hidden className={cn("size-3.5", isLoading && "animate-spin")} />
            </span>
            <span className="flex-1">Refresh</span>
            {fetchedAt !== null ? (
              <span className="text-xs text-muted-foreground">{formatAge(fetchedAt, Date.now())}</span>
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
