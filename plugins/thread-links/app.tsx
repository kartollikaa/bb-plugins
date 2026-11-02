import { useEffect, useState, type SyntheticEvent } from "react";
import {
  definePluginApp,
  experimental_Icon as BbIcon,
  experimental_THREAD_INFO_SECTION_GROUPS as SECTION_GROUPS,
  experimental_ThreadContextCardRow as ThreadContextCardRow,
  experimental_useRpcQuery as useRpcQuery,
  useBbNavigate,
  type ExperimentalThreadContextCardProps,
} from "@get-bb/plugin-sdk/app";
import { rpcContract, type GithubStatus } from "./lib/contract.ts";
import type { LinkKind, ThreadLink } from "./lib/links.ts";
import {
  badge,
  ciState,
  reviewVerdict,
  type CheckJob,
  type CiState,
  type JobState,
  type PullRequestBadge,
  type PullRequestStatus,
} from "./lib/pull-request.ts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

const GREEN = "text-green-600 dark:text-green-400";
const RED = "text-red-600 dark:text-red-400";
const VIOLET = "text-violet-600 dark:text-violet-400";

const BADGE: Record<PullRequestBadge, { icon: string; className: string; title: string }> = {
  draft: { icon: "GitPullRequestDraft", className: "text-muted-foreground", title: "Draft" },
  open: { icon: "GitPullRequest", className: GREEN, title: "Open" },
  conflicts: { icon: "GitPullRequest", className: RED, title: "Open, has conflicts" },
  merged: { icon: "GitMerge", className: VIOLET, title: "Merged" },
  closed: { icon: "GitPullRequestClosed", className: RED, title: "Closed" },
};

const DOT: Record<JobState, string> = {
  passed: "bg-green-500",
  failed: "bg-red-500",
  pending: "bg-amber-500",
  skipped: "bg-muted-foreground/40",
};

const CI_TITLE: Record<CiState, string> = {
  passed: "Checks passed",
  failed: "Checks failed",
  pending: "Checks running",
};

function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

function useOpenUrl() {
  const navigate = useBbNavigate();
  return (url: string) => {
    if (!navigate.openUrl(url)) window.open(url, "_blank", "noopener");
  };
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

function Dot({ state, pulse = false }: { state: JobState; pulse?: boolean }) {
  return (
    <span className="relative flex size-2 shrink-0">
      {pulse ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", DOT[state])} /> : null}
      <span className={cn("relative inline-flex size-2 rounded-full", DOT[state])} />
    </span>
  );
}

function JobRow({ job }: { job: CheckJob }) {
  const openUrl = useOpenUrl();
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent disabled:hover:bg-transparent"
      disabled={job.url === ""}
      onClick={() => openUrl(job.url)}
      title={job.workflow === "" ? job.name : `${job.workflow} / ${job.name}`}
    >
      <Dot state={job.state} />
      <span className="min-w-0 flex-1 truncate">{job.name}</span>
      {job.workflow === "" ? null : <span className="max-w-[40%] truncate text-muted-foreground">{job.workflow}</span>}
    </button>
  );
}

function CiDot({ jobs }: { jobs: CheckJob[] }) {
  const state = ciState(jobs);
  if (state === null) return null;
  const shown = jobs.filter((job) => job.state !== "skipped");
  const skipped = jobs.length - shown.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex size-4 items-center justify-center rounded-full hover:bg-accent"
          aria-label={CI_TITLE[state]}
          title={CI_TITLE[state]}
          onClick={stop}
          onPointerDown={stop}
        >
          <Dot state={state} pulse={state === "pending"} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1" onClick={stop} onPointerDown={stop}>
        <div className="max-h-80 overflow-y-auto">
          {shown.map((job) => (
            <JobRow key={`${job.workflow}/${job.name}`} job={job} />
          ))}
        </div>
        {skipped > 0 ? <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">{skipped} skipped</p> : null}
      </PopoverContent>
    </Popover>
  );
}

function ReviewIcon({ pr }: { pr: PullRequestStatus }) {
  const verdict = reviewVerdict(pr);
  if (verdict === null) return null;
  const approved = verdict === "approved";
  const who = approved ? pr.approvedBy : pr.changesRequestedBy;
  const title = `${approved ? "Approved" : "Changes requested"}${who.length > 0 ? ` by ${who.join(", ")}` : ""}`;
  return (
    <span title={title} aria-label={title} className="flex">
      <BbIcon name={approved ? "Check" : "FileDiff"} className={cn("size-3.5", approved ? GREEN : RED)} />
    </span>
  );
}

function PullRequestRow({ link, pr }: { link: ThreadLink; pr: PullRequestStatus }) {
  const openUrl = useOpenUrl();
  const look = BADGE[badge(pr)];
  return (
    <div>
      <ThreadContextCardRow
        leading={
          <span title={look.title} className="flex">
            <BbIcon name={look.icon} className={cn("size-4", look.className)} />
          </span>
        }
        label={`#${pr.number} ${pr.title}`}
        trailing={
          <span className="flex items-center gap-1.5">
            <ReviewIcon pr={pr} />
            <CiDot jobs={pr.jobs} />
          </span>
        }
        title={`${link.label}: ${pr.head} → ${pr.base}`}
        onClick={() => openUrl(link.url)}
      />
      <p className="pb-1 pl-6 text-xs text-muted-foreground">
        <span className={GREEN}>+{pr.additions}</span> <span className={RED}>−{pr.deletions}</span>
        {pr.changedFiles > 0 ? ` · ${pr.changedFiles} file${pr.changedFiles === 1 ? "" : "s"}` : null}
      </p>
    </div>
  );
}

function issueLeading(status: GithubStatus | undefined) {
  if (status?.kind !== "issue") return undefined;
  const open = status.issue.state === "open";
  return (
    <span title={open ? "Open" : status.issue.state === "not_planned" ? "Not planned" : "Closed"} className="flex">
      <BbIcon
        name={open ? "CircleDot" : "CircleCheck"}
        className={cn("size-4", open ? GREEN : status.issue.state === "not_planned" ? "text-muted-foreground" : VIOLET)}
      />
    </span>
  );
}

function LinkRow({ link }: { link: ThreadLink }) {
  const openUrl = useOpenUrl();
  const status = useGithubStatus(link);
  if (status?.kind === "pull-request") return <PullRequestRow link={link} pr={status.pullRequest} />;
  const label = status?.kind === "issue" ? `#${link.github?.number} ${status.issue.title}` : link.label;
  return (
    <ThreadContextCardRow
      icon={KIND_ICON[link.kind]}
      leading={issueLeading(status)}
      label={label}
      title={status?.kind === "unavailable" ? `${link.url}\n${status.message}` : link.url}
      onClick={() => openUrl(link.url)}
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
