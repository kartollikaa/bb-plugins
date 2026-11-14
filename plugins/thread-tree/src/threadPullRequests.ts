import { z } from "zod";

export const threadPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["draft", "open", "merged", "closed", "unknown"]),
  attention: z.string(),
  checks: z.object({ state: z.string() }),
});
export type ThreadPullRequest = z.infer<typeof threadPullRequestSchema>;

const linksSchema = z.object({ links: z.array(z.object({ kind: z.string(), url: z.string(), label: z.string() })) });
const statusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pull-request"), pullRequest: z.object({
    number: z.number(), title: z.string(), url: z.string(),
    state: z.enum(["draft", "open", "merged", "closed"]), conflicts: z.boolean(),
    jobs: z.array(z.object({ state: z.string() })),
  }) }),
  z.object({ kind: z.literal("unavailable"), message: z.string() }),
]);

type Call = <T>(method: string, input: { threadId: string } | { url: string }, schema: z.ZodType<T>) => Promise<T>;

export async function readThreadPullRequests(threadId: string, call: Call): Promise<ThreadPullRequest[]> {
  const { links } = await call("links", { threadId }, linksSchema);
  const urls = new Map<string, string>();
  for (const link of links) {
    if (link.kind !== "pull-request") continue;
    const match = link.url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)(?:[/?#]|$)/i);
    if (match) urls.set(`https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`, link.label);
  }
  const results: ThreadPullRequest[] = [];
  const entries = [...urls];
  for (let offset = 0; offset < entries.length; offset += 4) {
    results.push(...await Promise.all(entries.slice(offset, offset + 4).map(async ([url, label]) => {
      let pr: ThreadPullRequest = { url, number: Number(url.split("/").pop()), title: label, state: "unknown", attention: "unavailable", checks: { state: "unknown" } };
      try {
        const status = await call("githubStatus", { url }, statusSchema);
        if (status.kind === "pull-request") {
          const value = status.pullRequest;
          const checks = value.jobs.some((job) => job.state === "failed") ? "failing" : value.jobs.some((job) => job.state === "pending") ? "pending" : value.jobs.length ? "passing" : "none";
          pr = { ...value, url, attention: value.conflicts ? "conflicts" : "none", checks: { state: checks } };
        }
      } catch {}
      return pr;
    })));
  }
  return results;
}

export type PullRequestStatusRow =
  | { outcome: "available"; pullRequest: ThreadPullRequest }
  | { outcome: "absent" }
  | { outcome: "unavailable"; message: string };

/** A thread's PR states, or null while either source hasn't answered for it or bb's status is unavailable. */
export function knownPullRequestStates({
  hasEnvironment,
  statusRow,
  sessionRow,
}: {
  hasEnvironment: boolean;
  statusRow: PullRequestStatusRow | undefined;
  sessionRow: readonly ThreadPullRequest[] | undefined;
}): ThreadPullRequest["state"][] | null {
  if (!sessionRow) return null;
  if (hasEnvironment && (!statusRow || statusRow.outcome === "unavailable")) return null;
  return mergePullRequests(statusRow?.outcome === "available" ? statusRow.pullRequest : undefined, sessionRow).map((pr) => pr.state);
}

export function mergePullRequests(current: ThreadPullRequest | undefined, session: readonly ThreadPullRequest[]): ThreadPullRequest[] {
  const byUrl = new Map(session.map((pr) => [pr.url.toLowerCase(), pr]));
  if (current) byUrl.set(current.url.toLowerCase(), current);
  return [...byUrl.values()];
}


export function createThreadPullRequestReader(call: Call) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const limited: Call = async (method, input, schema) => {
    if (method !== "githubStatus") return call(method, input, schema);
    if (active < 4) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await call(method, input, schema);
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
  return (threadId: string) => readThreadPullRequests(threadId, limited);
}


export function excludeDescendantPullRequests(own: readonly ThreadPullRequest[], descendants: readonly ThreadPullRequest[]): ThreadPullRequest[] {
  const childUrls = new Set(descendants.map((pr) => pr.url.toLowerCase()));
  return own.filter((pr) => !childUrls.has(pr.url.toLowerCase()));
}
