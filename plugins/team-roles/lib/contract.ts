import { z } from "zod";
import { ROLE_NAME, RUNTIME_NAME, promptResultSchema, roleRowSchema, snapshotSchema } from "./schema.ts";

export const SNAPSHOT_TAG = "snapshot";

const roleName = z.string().max(64).regex(ROLE_NAME);

export const rpcContract = {
  snapshot: {
    input: z.null(),
    output: snapshotSchema,
    tags: () => [SNAPSHOT_TAG],
  },
  role: {
    input: z.object({ name: roleName }).strict(),
    output: roleRowSchema.extend({ generatedFiles: z.array(z.string()) }),
    tags: () => [SNAPSHOT_TAG],
  },
  prompt: {
    input: z.object({ name: roleName, runtime: z.string().max(64).regex(RUNTIME_NAME) }).strict(),
    output: promptResultSchema,
    tags: () => [SNAPSHOT_TAG],
  },
  refresh: {
    input: z.null(),
    output: snapshotSchema,
  },
  proposal: {
    input: z.object({ role: roleName.nullable() }).strict(),
    output: z.object({
      projectId: z.string().nullable(),
      projectName: z.string().nullable(),
      repo: z.string().nullable(),
      brief: z.string(),
    }),
  },
} as const;
