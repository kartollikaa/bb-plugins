import { useEffect, useState } from "react";
import {
  definePluginApp,
  experimental_THREAD_INFO_SECTION_GROUPS as SECTION_GROUPS,
  experimental_ThreadContextCardRow as ThreadContextCardRow,
  experimental_useRpcQuery as useRpcQuery,
  useBbNavigate,
  type ExperimentalThreadContextCardProps,
} from "@get-bb/plugin-sdk/app";
import { rpcContract, type GithubStatus } from "./lib/contract.ts";
import type { LinkKind, ThreadLink } from "./lib/links.ts";
import { headline, statusChips, type StatusChip, type Tone } from "./lib/pull-request.ts";
import { cn } from "@/lib/utils";

const VISIBLE_LINKS = 8;
const LIVE_REFRESH_MS = 60_000;

const KIND_ICON: Record<LinkKind, string> = {
  "pull-request": "GitPullRequest",
  issue: "CircleDot",
  commit: "GitCommitHorizontal",
  repository: "BookMarked",
  kaiten: "SquareKanban",
  buildin: "FileText",
  figma: "Figma",
  web: "Link",
};

const TONE_CLASS: Record<Tone, string> = {
  success: "text-green-600 dark:text-green-400",
  danger: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-600 dark:text-sky-400",
  merged: "text-violet-600 dark:text-violet-400",
  neutral: "text-muted-foreground",
};

function chipTitle(chips: StatusChip[]): string {
  return chips.map((chip) => (chip.detail ? `${chip.text}: ${chip.detail}` : chip.text)).join("\n");
}

function useGithubStatus(link: ThreadLink) {
  const enabled = link.kind === "pull-request" || link.kind === "issue";
  const query = useRpcQuery({ contract: rpcContract, method: "githubStatus", input: { url: link.url }, enabled });
  const live = query.data?.kind === "pull-request" && ["open", "draft"].includes(query.data.pullRequest.state);
  const { refetch } = query;
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void refetch(), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, refetch]);
  return query.data;
}

function prIcon(status: GithubStatus | undefined): string {
  if (status?.kind !== "pull-request") return "GitPullRequest";
  const state = status.pullRequest.state;
  return state === "merged" ? "GitMerge" : state === "closed" ? "GitPullRequestClosed" : state === "draft" ? "GitPullRequestDraft" : "GitPullRequest";
}

function Chips({ chips }: { chips: StatusChip[] }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 pb-1 pl-6 text-xs">
      {chips.map((chip) => (
        <span key={chip.text} className={TONE_CLASS[chip.tone]} title={chip.detail}>
          {chip.text}
          {chip.detail ? <span className="text-muted-foreground"> · {chip.detail}</span> : null}
        </span>
      ))}
    </div>
  );
}

function LinkRow({ link }: { link: ThreadLink }) {
  const navigate = useBbNavigate();
  const status = useGithubStatus(link);
  const open = () => {
    if (!navigate.openUrl(link.url)) window.open(link.url, "_blank", "noopener");
  };
  if (status?.kind === "pull-request") {
    const pr = status.pullRequest;
    const chips = statusChips(pr);
    const lead = headline(pr);
    return (
      <div>
        <ThreadContextCardRow
          icon={prIcon(status)}
          label={`#${pr.number} ${pr.title}`}
          trailing={<span className={cn("text-xs", TONE_CLASS[lead.tone])}>{lead.text}</span>}
          title={`${link.label} · ${pr.head} → ${pr.base}\n${chipTitle(chips)}`}
          onClick={open}
        />
        <Chips chips={chips} />
      </div>
    );
  }
  if (status?.kind === "issue") {
    const { state, title } = status.issue;
    const closed = state !== "open";
    return (
      <ThreadContextCardRow
        icon={closed ? "CircleCheck" : "CircleDot"}
        label={`#${link.github?.number} ${title}`}
        trailing={
          <span className={cn("text-xs", TONE_CLASS[closed ? "merged" : "success"])}>
            {state === "open" ? "Open" : state === "not_planned" ? "Not planned" : "Closed"}
          </span>
        }
        title={link.url}
        onClick={open}
      />
    );
  }
  return (
    <ThreadContextCardRow
      icon={KIND_ICON[link.kind]}
      label={link.label}
      trailing={
        status?.kind === "unavailable" ? (
          <span className="text-xs text-muted-foreground" title={status.message}>
            No access
          </span>
        ) : link.kind === "web" ? undefined : (
          <span className="text-xs text-muted-foreground">{link.host}</span>
        )
      }
      title={link.url}
      onClick={open}
    />
  );
}

function LinksSection({ threadId }: ExperimentalThreadContextCardProps) {
  const { data } = useRpcQuery({ contract: rpcContract, method: "links", input: { threadId } });
  const [expanded, setExpanded] = useState(false);
  const links = data?.links ?? [];
  if (links.length === 0) return null;
  const shown = expanded ? links : links.slice(0, VISIBLE_LINKS);
  const hidden = links.length - shown.length;
  return (
    <>
      {shown.map((link) => (
        <LinkRow key={link.url} link={link} />
      ))}
      {hidden > 0 || expanded ? (
        <ThreadContextCardRow
          icon={expanded ? "ChevronUp" : "ChevronDown"}
          label={expanded ? "Show fewer" : `${hidden} more`}
          onClick={() => setExpanded(!expanded)}
        />
      ) : null}
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadContextCardSection({
    id: "links",
    title: "Links",
    group: SECTION_GROUPS.related,
    order: 90,
    component: LinksSection,
  });
});
