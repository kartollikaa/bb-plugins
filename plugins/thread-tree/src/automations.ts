// Reads bb's Automations plugin over plugin RPC and trims each automation to
// what the sidebar draws. Its records are parsed loosely: unknown fields pass.
import { z } from "zod";

export const AUTOMATIONS_PLUGIN_ID = "automations";

export const automationSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string().nullable(),
  name: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.number().nullable(),
  lastRunAt: z.number().nullable(),
  lastRunStatus: z.string().nullable(),
  lastRunThreadId: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type AutomationSummary = z.infer<typeof automationSummarySchema>;

const timestamp = z.union([z.number(), z.string()]).nullish().transform((value) => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
});

export const overviewSchema = z.object({
  automations: z.array(
    z
      .object({
        automation: z
          .object({
            id: z.string(),
            projectId: z.string(),
            name: z.string(),
            enabled: z.boolean(),
            nextRunAt: timestamp,
            lastRunAt: timestamp,
            lastRunStatus: z.string().nullish(),
            lastRunThreadId: z.string().nullish(),
            lastError: z.string().nullish(),
          })
          .passthrough(),
        project: z.object({ name: z.string() }).passthrough().nullish(),
      })
      .passthrough(),
  ),
});

export function summarizeOverview(overview: z.infer<typeof overviewSchema>): AutomationSummary[] {
  return overview.automations.map(({ automation, project }) => ({
    id: automation.id,
    projectId: automation.projectId,
    projectName: project?.name ?? null,
    name: automation.name,
    enabled: automation.enabled,
    nextRunAt: automation.nextRunAt,
    lastRunAt: automation.lastRunAt,
    lastRunStatus: automation.lastRunStatus ?? null,
    lastRunThreadId: automation.lastRunThreadId ?? null,
    lastError: automation.lastError ?? null,
  }));
}

export const AUTOMATION_ACTION_METHOD = {
  run: "automations_run",
  pause: "automations_pause",
  resume: "automations_resume",
} as const;
export type AutomationAction = keyof typeof AUTOMATION_ACTION_METHOD;

/** Live run first, then paused, then a failed last run; otherwise done. */
export function automationDot(automation: AutomationSummary): "running" | "stopped" | "error" | "done" {
  if (automation.lastRunStatus === "running") return "running";
  if (!automation.enabled) return "stopped";
  if (automation.lastRunStatus === "failed" || automation.lastError) return "error";
  return "done";
}

/** Enabled first, soonest next run first; paused after, by name. */
export function sortAutomations(automations: readonly AutomationSummary[]): AutomationSummary[] {
  return [...automations].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const next = (a.nextRunAt ?? Number.MAX_SAFE_INTEGER) - (b.nextRunAt ?? Number.MAX_SAFE_INTEGER);
    return next || a.name.localeCompare(b.name);
  });
}
