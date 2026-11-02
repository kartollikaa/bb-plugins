import { useState } from "react";
import {
  Markdown,
  experimental_NewThreadComposer as NewThreadComposer,
  experimental_usePluginId as usePluginId,
  experimental_useRpcQuery as useRpcQuery,
  useBbNavigate,
  useRpc,
  useSdk,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { rpcContract } from "@/lib/contract";
import type { GithubPr } from "@/lib/github";
import {
  PR_PANEL_PATH,
  displayDescription,
  detailParts,
  parsePrUrl,
  prSubPath,
  prUrlFromSubPath,
  statusParts,
  type PrDetails,
} from "@/lib/pr-context";

/** The panel: a PR's context card over bb's new-thread composer, or the folder's PRs at the root. */
export function PrPage({ subPath }: PluginNavPanelProps) {
  const url = prUrlFromSubPath(subPath);
  return <div className="h-full overflow-y-auto">{url ? <PrCompose key={url} url={url} /> : <PrIndex />}</div>;
}

function useFolderPr(url: string): GithubPr | undefined {
  const { data } = useRpcQuery({ contract: rpcContract, method: "folder", input: null });
  return [...(data?.items ?? []), ...(data?.snoozed ?? [])].find((item) => item.pr.url === url)?.pr;
}

function PrCompose({ url }: { url: string }) {
  const target = parsePrUrl(url)!;
  const summary = useFolderPr(url);
  const details = useRpcQuery({ contract: rpcContract, method: "prContext", input: { url } });
  const project = useRpcQuery({ contract: rpcContract, method: "prProject", input: { repo: target.repo } });
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const navigate = useBbNavigate();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-6">
      <PrCard
        url={url}
        title={details.data?.pr.title ?? summary?.title ?? null}
        details={details.data?.pr ?? null}
        summary={summary ?? null}
        error={details.error?.message ?? null}
        onOpenOnGithub={() => navigate.openUrl(url)}
      />
      {project.isLoading ? null : (
        <NewThreadComposer
          defaultProjectId={project.data?.projectId ?? undefined}
          placeholder={`Ask about ${target.repo.split("/")[1]}#${target.number}…`}
          focusRequest={1}
          draftKey={`github-folder:pr:${url}`}
          onSubmit={async (request) => {
            const { context } = details.data ?? (await rpc.call("prContext", { url }));
            const thread = await sdk.threads.spawn({
              ...request,
              input: [...request.input, { type: "text", text: context, mentions: [], visibility: "agent-only" }],
            });
            navigate.toThread(thread.id);
          }}
        />
      )}
    </div>
  );
}

const CHIP = "inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground";

/** Status from the folder row while `gh pr view` is still loading. */
function summaryStatus(pr: GithubPr): string[] {
  return [
    pr.isDraft ? "Open, draft" : "Open",
    pr.review === "approved" ? "Review: approved" : pr.review === "changes_requested" ? "Review: changes requested" : "",
    pr.ci === "failed" ? "CI: failed" : pr.ci === "pending" ? "CI: running" : pr.ci === "passed" ? "CI: passed" : "",
    pr.conflicts ? "Merge conflicts" : "",
  ].filter(Boolean);
}

function PrCard({
  url,
  title,
  details,
  summary,
  error,
  onOpenOnGithub,
}: {
  url: string;
  title: string | null;
  details: PrDetails | null;
  summary: GithubPr | null;
  error: string | null;
  onOpenOnGithub: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const target = parsePrUrl(url)!;
  const status = details ? statusParts(details) : summary ? summaryStatus(summary) : [];
  const pluginId = usePluginId();
  const description = details
    ? displayDescription(
        details.body,
        (asset) => `/api/v1/plugins/${encodeURIComponent(pluginId)}/http/pr-image?pr=${encodeURIComponent(url)}&asset=${asset}`,
      )
    : "";
  return (
    <section aria-label="Pull request context" className="rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <Icon
          name={(details?.isDraft ?? summary?.isDraft) ? "GitPullRequestDraft" : "GitPullRequest"}
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {target.repo}#{target.number} · context for the new thread
          </div>
          <div className="truncate text-sm font-medium">{title ?? "Loading…"}</div>
        </div>
        <button
          type="button"
          aria-label="Open on GitHub"
          title="Open on GitHub"
          onClick={onOpenOnGithub}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover"
        >
          <Icon name="ArrowUpRight" aria-hidden className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1 px-3 pt-2">
        {status.map((part) => (
          <span key={part} className={CHIP}>
            {part}
          </span>
        ))}
        {details
          ? detailParts(details).map((part) => (
              <span key={part} className={CHIP}>
                {part}
              </span>
            ))
          : null}
      </div>
      <div className="px-3 pb-2.5 pt-2 text-sm">
        {error !== null && !details ? (
          <p className="text-xs text-destructive">Can’t read the pull request: {error}</p>
        ) : !details ? (
          <p className="text-xs text-muted-foreground">Loading the description…</p>
        ) : description === "" ? (
          <p className="text-xs text-muted-foreground">No description</p>
        ) : (
          <>
            <div className={cn("relative", isExpanded ? "max-h-[50vh] overflow-y-auto" : "max-h-32 overflow-hidden")}>
              <Markdown content={description} className="text-sm" />
              {isExpanded ? null : <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card" />}
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? "Show less" : "Show more"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function PrIndex() {
  const { data, isLoading } = useRpcQuery({ contract: rpcContract, method: "folder", input: null });
  const navigate = useBbNavigate();
  const items = data?.items ?? [];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-4 py-6">
      <p className="pb-2 text-sm text-muted-foreground">Pick a pull request to start a thread with its context.</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!isLoading && items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing needs you.</p> : null}
      {items.map(({ pr }) => (
        <button
          key={pr.url}
          type="button"
          onClick={() => {
            const subPath = prSubPath(pr.url);
            if (subPath) navigate.toPluginPanel(PR_PANEL_PATH, { subPath });
          }}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-state-hover"
        >
          <Icon name={pr.isDraft ? "GitPullRequestDraft" : "GitPullRequest"} aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{pr.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {pr.repo}#{pr.number}
          </span>
        </button>
      ))}
    </div>
  );
}
