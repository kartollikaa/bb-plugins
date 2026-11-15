import { z } from "zod";
const text = z.string().max(200);
const cell = z.union([
  z.string().max(1000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const configSchema = z
  .object({
    source: z
      .object({
        root: z.enum(["workspace", "storage"]),
        path: z
          .string()
          .min(1)
          .max(1024)
          .refine(
            (p) =>
              !p.startsWith("/") &&
              !p.includes("\\") &&
              !p.split("/").some((s) => !s || s === ".." || s === ".") &&
              !p.includes("\0"),
            "Use a relative file path without traversal",
          ),
      })
      .strict(),
    view: z.enum(["Metric", "Table", "Chart", "Pipeline"]),
    title: text.optional(),
  })
  .strict();
export const reportSchema = z
  .object({
    metrics: z
      .array(z.object({ label: text, value: cell }).strict())
      .max(24)
      .optional(),
    table: z
      .object({
        columns: z.array(text).min(1).max(20),
        rows: z.array(z.array(cell).max(20)).max(200),
      })
      .strict()
      .optional(),
    chart: z
      .array(z.object({ label: text, value: z.number().finite() }).strict())
      .max(100)
      .optional(),
    pipeline: z
      .array(
        z
          .object({
            label: text,
            status: z.enum([
              "pending",
              "running",
              "passed",
              "failed",
              "skipped",
            ]),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
export type Report = z.infer<typeof reportSchema>;
export const bindingSchema = z
  .object({
    threadId: z.string().min(1).max(100),
    messageId: z.string().min(1).max(200),
    index: z.number().int().min(0).max(1000),
    config: configSchema,
  })
  .strict();
export type Binding = z.infer<typeof bindingSchema>;
export const snapshotSchema = z.object({
  report: reportSchema.nullable(),
  readAt: z.number().nullable(),
  revision: z.string().nullable(),
  error: z.string().nullable(),
  revoked: z.boolean(),
  live: z.boolean(),
  expiresAt: z.number().nullable(),
  identity: z.string(),
  durationMinutes: z.number(),
  leaseSeconds: z.number(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
