export type ArchiveLanding = "archived" | "cancelled" | "stopped" | "timeout";
export type ArchiveRunStop = Exclude<ArchiveLanding, "archived"> | "unavailable" | "busy";

export interface ArchiveRunResult {
  archived: string[];
  /** Roots whose worktrees got changes after the click; skipped, not archived. */
  changed: string[];
  stop: ArchiveRunStop | null;
}

/** Runs bb's Archive on each root in turn; a root left unarchived means the user cancelled bb's confirmation, so the rest aren't asked. */
export async function archiveInTurn(
  rootIds: readonly string[],
  {
    actionOf,
    isStillClean,
    landed,
    signal,
  }: {
    actionOf: (id: string) => (() => Promise<void>) | undefined;
    isStillClean: (id: string) => Promise<boolean>;
    landed: (id: string) => Promise<ArchiveLanding>;
    signal?: AbortSignal;
  },
): Promise<ArchiveRunResult> {
  const archived: string[] = [];
  const changed: string[] = [];
  for (const id of rootIds) {
    if (signal?.aborted) return { archived, changed, stop: "stopped" };
    if (!(await isStillClean(id))) {
      changed.push(id);
      continue;
    }
    const run = actionOf(id);
    if (!run) return { archived, changed, stop: "unavailable" };
    await run();
    const landing = await landed(id);
    if (landing !== "archived") return { archived, changed, stop: landing };
    archived.push(id);
  }
  return { archived, changed, stop: null };
}

/** How long an archive may take to land once no dialog is open; a large cascade can take seconds to record. */
export const ARCHIVE_LANDING_GRACE_MS = 10_000;

/** bb's Archive `run()` settles while its confirmation is still open, so this waits on the archive itself: as long as a dialog is up, then a grace for it to land. */
export async function waitForArchive(
  isArchived: () => Promise<boolean>,
  {
    dialogOpen,
    deadline,
    graceMs = ARCHIVE_LANDING_GRACE_MS,
    intervalMs,
    signal,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }: {
    dialogOpen: () => boolean;
    deadline: number;
    graceMs?: number;
    intervalMs: number;
    signal?: AbortSignal;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<ArchiveLanding> {
  let closedSince: number | null = null;
  for (;;) {
    if (await isArchived()) return "archived";
    if (signal?.aborted) return "stopped";
    if (now() >= deadline) return "timeout";
    if (dialogOpen()) closedSince = null;
    else {
      closedSince ??= now();
      if (now() - closedSince >= graceMs) return "cancelled";
    }
    await sleep(intervalMs);
  }
}

/** On compact width the sidebar itself sits in a dialog drawer, which is not bb's confirmation. */
export function dialogOutsideSidebar(dialogs: Iterable<{ contains(node: never): boolean }>, sidebar: unknown): boolean {
  for (const dialog of dialogs) if (!sidebar || !dialog.contains(sidebar as never)) return true;
  return false;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function skippedSummary({ skipped, kept }: { skipped: number; kept: number }): string | null {
  if (skipped + kept === 0) return null;
  return `Skipped ${plural(skipped, "thread")} with uncommitted changes${kept ? ` and ${plural(kept, "thread")} above them` : ""}`;
}

export interface FoldArchiveOutcome {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  description?: string;
}

const STOP_REASON: Partial<Record<ArchiveRunStop, string>> = {
  unavailable: "bb offers no Archive for one of the threads",
  timeout: "bb's confirmation wasn't answered in time",
};

/** The toast a finished run ends with; null where bb's own Undo toast or a deliberate cancel says enough. */
export function foldArchiveOutcome({
  archived,
  skipped,
  kept,
  changed,
  stop,
}: {
  archived: number;
  skipped: number;
  kept: number;
  changed: number;
  stop: ArchiveRunStop | null;
}): FoldArchiveOutcome | null {
  if (stop === "busy") return { tone: "info", title: "Another fold is still archiving" };
  const reason = stop ? STOP_REASON[stop] : undefined;
  if (reason) return { tone: stop === "unavailable" ? "error" : "warning", title: archived > 0 ? `Archived ${plural(archived, "thread")}` : "Archive stopped", description: reason };
  const parts = [skippedSummary({ skipped, kept }), changed > 0 ? `Skipped ${plural(changed, "thread")} that got changes since` : null];
  if (stop && archived > 0) parts.push("Stopped before the rest");
  const description = parts.filter((part) => part !== null).join(". ");
  if (archived === 0) return stop || !description ? null : { tone: "warning", title: "Nothing archived", description };
  if (!description) return null;
  return { tone: stop ? "warning" : "success", title: `Archived ${plural(archived, "thread")}`, description };
}
