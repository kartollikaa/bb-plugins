import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const linkSchema = z.object({
  url: z.string(),
  kind: z.enum(["pull-request", "issue", "commit", "repository", "kaiten", "buildin", "figma", "web"]),
  label: z.string(),
  host: z.string(),
  github: z.object({ owner: z.string(), repo: z.string(), number: z.number() }).nullable(),
  firstSeq: z.number(),
  lastSeq: z.number(),
  mentions: z.number(),
});

const pullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["draft", "open", "merged", "closed"]),
  review: z.enum(["approved", "changes_requested", "review_required", "none"]),
  approvedBy: z.array(z.string()),
  changesRequestedBy: z.array(z.string()),
  awaitingReviewers: z.array(z.string()),
  checks: z.object({
    passed: z.number(),
    failed: z.number(),
    pending: z.number(),
    skipped: z.number(),
    failedNames: z.array(z.string()),
  }),
  merge: z.enum(["clean", "conflicts", "behind", "blocked", "unstable", "unknown"]).nullable(),
  autoMerge: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
  base: z.string(),
  head: z.string(),
});

const githubStatusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pull-request"), pullRequest: pullRequestSchema }),
  z.object({
    kind: z.literal("issue"),
    issue: z.object({ title: z.string(), state: z.enum(["open", "completed", "not_planned", "closed"]) }),
  }),
  z.object({ kind: z.literal("unavailable"), message: z.string() }),
]);

const githubUrl = z
  .string()
  .max(300)
  .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(pull|issues)\/\d+$/);

export const rpcContract = defineRpcContract({
  links: {
    input: z.object({ threadId: z.string().min(1).max(200) }).strict(),
    output: z.object({ links: z.array(linkSchema) }),
    tags: ({ threadId }) => [`links:${threadId}`],
  },
  githubStatus: {
    input: z.object({ url: githubUrl }).strict(),
    output: githubStatusSchema,
  },
});

export type GithubStatus = z.infer<typeof githubStatusSchema>;
