import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { folderItemSchema, settingsPatchSchema, settingsSchema } from "./github";

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
  snooze: {
    input: z.object({ key: z.string().min(1).max(400), snoozed: z.boolean() }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
});
