import { experimental_useRpcKeyedQuery, useBbNavigate, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const contract = {
  pullRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(z.string(), z.discriminatedUnion("outcome", [
      z.object({
        outcome: z.literal("available"),
        pullRequest: z.object({
          number: z.number(),
          title: z.string(),
          url: z.string(),
          state: z.enum(["draft", "open", "merged", "closed"]),
          attention: z.string(),
          checks: z.object({ state: z.string() }),
        }),
      }),
      z.object({ outcome: z.literal("absent") }),
      z.object({ outcome: z.literal("unavailable"), message: z.string() }),
    ])),
  },
};

export function ThreadPullRequestBadge({ thread }: { thread: PluginSidebarThread }) {
  const navigate = useBbNavigate();
  const environmentId = thread.environment?.id;
  const { data, error } = experimental_useRpcKeyedQuery({
    pluginId: "bb--github-pr-status",
    contract,
    method: "pullRequests",
    keys: environmentId ? [environmentId] : [],
    enabled: Boolean(environmentId),
  });
  const row = environmentId ? data?.[environmentId] : undefined;
  if (error || row?.outcome !== "available") return null;
  const pr = row.pullRequest;
  const active = pr.state === "open" || pr.state === "draft";
  const failed = active && (pr.checks.state === "failing" || pr.attention === "conflicts");
  const pending = active && !failed && pr.checks.state === "pending";
  const details: string[] = [pr.state];
  if (active && pr.attention !== "none" && pr.attention !== pr.state) details.push(pr.attention.replaceAll("_", " "));
  if (active && !pr.attention.startsWith("checks_")) details.push(`checks ${pr.checks.state}`);
  const label = `PR #${pr.number}: ${pr.title} · ${details.join(" · ")}`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        navigate.openUrl(pr.url);
      }}
      className={cn(
        "relative mx-1 flex size-4 shrink-0 items-center justify-center rounded outline-none hover:bg-sidebar-foreground/10 focus-visible:ring-1 focus-visible:ring-sidebar-ring",
        pr.state === "merged" ? "text-purple-400" : pr.state === "closed" ? "text-red-400" : pr.state === "draft" ? "text-muted-foreground" : "text-green-400",
      )}
    >
      <Icon name={pr.state === "merged" ? "GitMerge" : pr.state === "closed" ? "GitPullRequestClosed" : pr.state === "draft" ? "GitPullRequestDraft" : "GitPullRequest"} aria-hidden className="size-3.5" />
      {failed ? <Icon name="X" aria-hidden className="absolute -bottom-0.5 -right-1 size-2.5 rounded-full bg-sidebar text-red-400" /> : null}
      {pending ? <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full bg-amber-400" /> : null}
    </button>
  );
}
