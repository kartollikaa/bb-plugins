import { z } from "zod";

export const ROLE_NAME = /^[a-z][a-z-]*$/;
export const RUNTIME_NAME = /^[a-z][a-z0-9-]*$/;

export const runtimeSchema = z.object({
  agent: z.string(),
  model: z.string(),
  effort: z.string(),
  disallowed_tools: z.array(z.string()),
  features: z.record(z.string(), z.boolean()),
  unenforced: z.array(z.string()),
});
export type RuntimeRow = z.infer<typeof runtimeSchema>;

export const roleRowSchema = z.object({
  name: z.string(),
  intent: z.string(),
  tier: z.string(),
  effort: z.string(),
  access: z.enum(["read-only", "edit"]),
  shell: z.boolean(),
  web: z.boolean(),
  source: z.string(),
  runtimes: z.record(z.string(), runtimeSchema),
});
export type RoleRow = z.infer<typeof roleRowSchema>;

export const rolesFileSchema = z.object({
  version: z.literal(1),
  roles: z.record(
    z.string().regex(ROLE_NAME),
    roleRowSchema.omit({ name: true }),
  ),
});

export const installSchema = z.object({
  root: z.string(),
  version: z.string().nullable(),
  key: z.string().nullable(),
  scope: z.string().nullable(),
  commit: z.string().nullable(),
  enabled: z.boolean().nullable(),
  source: z.enum(["setting", "installed_plugins", "cache-scan"]),
  others: z.array(z.string()),
});
export type InstallInfo = z.infer<typeof installSchema>;

export const generatedSchema = z.object({
  state: z.enum(["current", "stale", "invalid", "unknown"]),
  problems: z.array(z.string()),
  error: z.string().nullable(),
  other: z.array(z.string()),
});
export type GeneratedStatus = z.infer<typeof generatedSchema>;

export const codexSchema = z.object({
  state: z.enum(["installed", "pending", "conflict", "not-installed", "blocked", "unknown"]),
  dest: z.string().nullable(),
  steps: z.array(z.object({ action: z.string(), file: z.string() })),
  message: z.string().nullable(),
  problems: z.array(z.string()),
  other: z.array(z.string()),
  applyCommand: z.string().nullable(),
});
export type CodexStatus = z.infer<typeof codexSchema>;

export const snapshotSchema = z.object({
  install: installSchema.nullable(),
  installError: z.string().nullable(),
  roles: z.array(roleRowSchema),
  rolesError: z.string().nullable(),
  generated: generatedSchema,
  codex: codexSchema,
  hostId: z.string().nullable(),
  checkedAt: z.number(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export const promptResultSchema = z.object({
  prompt: z.string().nullable(),
  error: z.string().nullable(),
  differsFromTable: z.array(z.string()),
});
export type PromptResult = z.infer<typeof promptResultSchema>;

export type RunResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failure: string | null;
};
