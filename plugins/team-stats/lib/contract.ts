import { z } from "zod";
export const querySchema = z
  .object({
    projectId: z.string().min(1).nullable(),
    threadId: z.string().min(1).nullable(),
    archived: z.boolean(),
  })
  .strict();
export const runSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  projectId: z.string(),
  provider: z.string(),
  member: z.string(),
  model: z.string(),
  label: z.string(),
  state: z.string(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  durationMs: z.number().nullable(),
  tokens: z.number().nullable(),
  tools: z.number().nullable(),
  source: z.string(),
});
export const rpcContract = {
  scan: {
    input: querySchema,
    output: z.object({
      runs: z.array(runSchema),
      scannedThreads: z.number(),
      partial: z.boolean(),
      failedThreads: z.number(),
      scannedAt: z.number(),
    }),
  },
  projects: {
    input: z.null(),
    output: z.array(z.object({ id: z.string(), name: z.string() })),
  },
} as const;
