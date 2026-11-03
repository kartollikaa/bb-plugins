import { z } from "zod";

export const LIST_TAG = "artifacts";

export const artifactSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  updatedAt: z.string().nullable(),
  description: z.string().nullable(),
  /** Who can open it: "Public", "Private", … */
  detail: z.string().nullable(),
  starred: z.boolean(),
  thumbnail: z.string().nullable(),
  thumbnailDark: z.string().nullable(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const sourceSchema = z.object({
  items: z.array(artifactSchema),
  /** Why the list is empty or partial; null when the read worked. */
  error: z.string().nullable(),
});
export type SourceList = z.infer<typeof sourceSchema>;

export const listViewSchema = z.object({
  claude: sourceSchema,
  codex: sourceSchema,
  /** Null until the first fetch finishes. */
  fetchedAt: z.number().nullable(),
});
export type ListView = z.infer<typeof listViewSchema>;

export const rpcContract = {
  list: {
    input: z.null(),
    output: listViewSchema,
    tags: () => [LIST_TAG],
  },
  refresh: {
    input: z.null(),
    output: listViewSchema,
  },
} as const;
