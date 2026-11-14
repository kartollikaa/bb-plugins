// A finished thread's diff in one line, from bb's Git plugin status read.
import { z } from "zod";

export const GIT_PLUGIN_ID = "bb--git";

const sideSchema = z.object({
  insertions: z.number(),
  deletions: z.number(),
  lineStatsComplete: z.boolean(),
  fileCount: z.number(),
  files: z.array(z.object({ path: z.string() })),
});
type Side = z.infer<typeof sideSchema>;

const rowSchema = z.object({
  outcome: z.literal("available"),
  workspace: z.object({ workingTree: sideSchema, mergeBase: sideSchema.nullable().optional() }),
});

export interface DiffStat {
  insertions: number;
  deletions: number;
  files: number;
  linesComplete: boolean;
}

function fileCount(sides: readonly Side[]): number {
  if (sides.some((side) => side.files.length < side.fileCount)) return sides.reduce((sum, side) => sum + side.fileCount, 0);
  return new Set(sides.flatMap((side) => side.files.map((file) => file.path))).size;
}

/** The branch's commits since its merge base plus uncommitted work; null when there is no diff or no readable row. */
export function diffStatOf(row: unknown): DiffStat | null {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success) return null;
  const { workingTree, mergeBase } = parsed.data.workspace;
  const sides = mergeBase ? [workingTree, mergeBase] : [workingTree];
  const files = fileCount(sides);
  if (files === 0) return null;
  return {
    insertions: sides.reduce((sum, side) => sum + side.insertions, 0),
    deletions: sides.reduce((sum, side) => sum + side.deletions, 0),
    files,
    linesComplete: sides.every((side) => side.lineStatsComplete),
  };
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
