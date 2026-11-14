// A finished thread's diff in one line, from bb's Git plugin status read.
import { z } from "zod";

export const GIT_PLUGIN_ID = "bb--git";

const rowSchema = z.object({
  outcome: z.literal("available"),
  workspace: z.object({
    allChanges: z.object({ insertions: z.number(), deletions: z.number(), lineStatsComplete: z.boolean(), fileCount: z.number() }),
  }),
});

export interface DiffStat {
  insertions: number;
  deletions: number;
  files: number;
  linesComplete: boolean;
}

/** The net diff from the merge base to the worktree, commits and uncommitted work together; null when there is none. */
export function diffStatOf(row: unknown): DiffStat | null {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) return null;
  const { insertions, deletions, lineStatsComplete, fileCount } = parsed.data.workspace.allChanges;
  return fileCount === 0 ? null : { insertions, deletions, files: fileCount, linesComplete: lineStatsComplete };
}

export function formatDiffStat(stat: DiffStat): string {
  const files = `${stat.files} ${stat.files === 1 ? "file" : "files"}`;
  return stat.linesComplete ? `+${stat.insertions} −${stat.deletions} · ${files}` : files;
}

export interface DiffStatThread {
  id: string;
  isArchived: boolean;
  environment: { id: string | null; isWorktree: boolean | null } | null;
}

/** A plain checkout or a worktree shared beyond the thread's own subtree holds others' work too, so its diff isn't this thread's result. */
export function diffStatEnvironmentOf(thread: DiffStatThread, threads: readonly DiffStatThread[], descendantIdsOf: (threadId: string) => readonly string[]): string | null {
  const environmentId = thread.environment?.id;
  if (!environmentId || thread.environment?.isWorktree !== true) return null;
  const own = new Set([thread.id, ...descendantIdsOf(thread.id)]);
  const shared = threads.some((other) => !other.isArchived && !own.has(other.id) && other.environment?.id === environmentId);
  return shared ? null : environmentId;
}
