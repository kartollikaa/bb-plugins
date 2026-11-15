import type { PluginRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { bindingSchema, snapshotSchema, reportSchema } from "./schema.ts";
export const rpcContract = {
  snapshot: {
    input: bindingSchema,
    output: snapshotSchema,
    tags: (i: import("./schema.ts").Binding) => [JSON.stringify(i)],
  },
  control: {
    input: z
      .object({
        binding: bindingSchema,
        client: z.string().uuid(),
        action: z.enum(["mount", "resume", "pause", "heartbeat", "refresh"]),
      })
      .strict(),
    output: snapshotSchema,
  },
} satisfies PluginRpcContract;
const source = z
  .object({
    key: z.string(),
    root: z.string(),
    path: z.string(),
    until: z.number(),
  })
  .strict();
export const hostContract = {
  status: { input: z.null(), output: z.object({ watchers: z.number() }) },
  read: {
    input: source,
    output: z.object({
      report: reportSchema.nullable(),
      revision: z.string().nullable(),
      error: z.string().nullable(),
      revoked: z.boolean(),
    }),
  },
  watch: { input: source, output: z.boolean() },
  stop: { input: z.object({ key: z.string() }).strict(), output: z.boolean() },
} satisfies PluginRpcContract;
export const hostSignals = {
  changed: {
    payload: z.object({ key: z.string(), failed: z.boolean() }).strict(),
  },
};
