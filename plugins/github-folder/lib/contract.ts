import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { folderItemSchema, settingsPatchSchema, settingsSchema } from "./github";
import { prDetailsSchema } from "./pr-context";

export const FOLDER_TAG = "folder";

export const folderViewSchema = z.object({
  items: z.array(folderItemSchema),
  snoozed: z.array(folderItemSchema),
  orgs: z.array(z.string()),
  accounts: z.array(z.string()),
  /** Set when no gh login could be read. */
  error: z.string().nullable(),
  /** Null until the first fetch finishes. */
  fetchedAt: z.number().nullable(),
  settings: settingsSchema,
});
export type FolderView = z.infer<typeof folderViewSchema>;

export const rpcContract = defineRpcContract({
  folder: {
    input: z.null(),
    output: folderViewSchema,
    tags: () => [FOLDER_TAG],
  },
  refresh: {
    input: z.null(),
    output: folderViewSchema,
  },
  updateSettings: {
    input: settingsPatchSchema,
    output: z.object({ ok: z.literal(true) }),
  },
  /** The PR's details and the agent-only context a thread about it starts with. */
  prContext: {
    input: z.object({ url: z.string().min(1).max(400) }).strict(),
    output: z.object({ pr: prDetailsSchema, context: z.string() }),
  },
  /** The bb project whose git remote is this `owner/repo`; no GitHub call, so it answers at once. */
  prProject: {
    input: z.object({ repo: z.string().min(3).max(200) }).strict(),
    output: z.object({ projectId: z.string().nullable() }),
  },
  snooze: {
    input: z.object({ key: z.string().min(1).max(400), snoozed: z.boolean() }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
});
