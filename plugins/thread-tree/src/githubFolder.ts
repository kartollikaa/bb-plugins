import { z } from "zod";

/** The GitHub Folder plugin, whose data the GitHub section draws. */
export const GITHUB_FOLDER_PLUGIN_ID = "github-folder";

const ATTENTIONS = ["review", "changes_requested", "ci_failed", "conflicts", "ready", "assigned", "mentioned"] as const;
export type Attention = (typeof ATTENTIONS)[number];

const itemSchema = z.object({
  pr: z.object({
    url: z.string(),
    number: z.number(),
    title: z.string(),
    repo: z.string(),
    author: z.string(),
    isDraft: z.boolean(),
    updatedAt: z.string(),
  }),
  attention: z.array(z.enum(ATTENTIONS)),
  snoozeKey: z.string(),
});
export type GithubFolderItem = z.infer<typeof itemSchema>;

export const githubSettingsSchema = z.object({
  sources: z.object({ review: z.boolean(), author: z.boolean(), assigned: z.boolean(), mentioned: z.boolean() }),
  myPrs: z.enum(["attention", "all"]),
  teamReviews: z.boolean(),
  drafts: z.boolean(),
  hiddenOrgs: z.array(z.string()),
});
export type GithubSettings = z.infer<typeof githubSettingsSchema>;

/** The slice of github-folder's `folder` output this list draws. */
export const githubFolderViewSchema = z.object({
  items: z.array(itemSchema),
  snoozed: z.array(itemSchema),
  orgs: z.array(z.string()),
  accounts: z.array(z.string()),
  error: z.string().nullable(),
  fetchedAt: z.number().nullable(),
  settings: githubSettingsSchema,
});
export type GithubFolderView = z.infer<typeof githubFolderViewSchema>;

export const githubSettingsPatchSchema = githubSettingsSchema
  .extend({ sources: githubSettingsSchema.shape.sources.partial() })
  .partial()
  .strict();
export type GithubSettingsPatch = z.infer<typeof githubSettingsPatchSchema>;

export const ATTENTION_LABEL: Record<Attention, string> = {
  review: "Review requested",
  changes_requested: "Changes requested",
  ci_failed: "Checks failing",
  conflicts: "Has conflicts",
  ready: "Approved, ready to merge",
  assigned: "Assigned to you",
  mentioned: "Mentions you",
};

export function githubFolderPrPath(url: string): string | null {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(url);
  return match ? `/plugins/github-folder/pr/${match[1]}/${match[2]}/${match[3]}` : null;
}

const ABSENT_CODES = new Set(["not_found", "unknown_method"]);

/** Not installed or without the method; any other failure is transient and must not read as an empty folder. */
export function githubFolderAbsent(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : null;
  return typeof code === "string" && ABSENT_CODES.has(code);
}
