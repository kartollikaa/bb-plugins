export type ArchiveLanding = "archived" | "cancelled" | "stopped" | "timeout";
export type ArchiveRunStop = Exclude<ArchiveLanding, "archived"> | "unavailable" | "busy" | "error";

export interface ArchiveRunResult {
  archived: string[];
  /** Roots whose worktrees got changes after the click; skipped, not archived. */
  changed: string[];
  /** Roots skipped because their worktrees couldn't be checked again. */
  unchecked: string[];
  stop: ArchiveRunStop | null;
  error?: string;
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
  const unchecked: string[] = [];
  try {
    return await archiveEach();
  } catch (error) {
    return { archived, changed, unchecked, stop: "error", error: error instanceof Error ? error.message : String(error) };
  }

  async function archiveEach(): Promise<ArchiveRunResult> {
    for (const id of rootIds) {
      if (signal?.aborted) return { archived, changed, unchecked, stop: "stopped" };
      const clean = await isStillClean(id).catch(() => null);
      if (clean === null) {
        unchecked.push(id);
        continue;
      }
      if (!clean) {
        changed.push(id);
        continue;
      }
      const run = actionOf(id);
      if (!run) return { archived, changed, unchecked, stop: "unavailable" };
      await run();
      const landing = await landed(id);
      if (landing !== "archived") return { archived, changed, unchecked, stop: landing };
      archived.push(id);
    }
    return { archived, changed, unchecked, stop: null };
  }
}

/** Takes the one run slot before claiming, so an overlapping fold can't rebatch or release the running fold's threads. */
export async function runClaimedArchive({
  acquire,
  release,
  claim,
  unclaim,
  archive,
}: {
  acquire: () => boolean;
  release: () => void;
  claim: () => Promise<string | null>;
  unclaim: (claimId: string) => Promise<void>;
  archive: () => Promise<ArchiveRunResult>;
}): Promise<ArchiveRunResult> {
  if (!acquire()) return { archived: [], changed: [], unchecked: [], stop: "busy" };
  try {
    const claimId = await claim();
    try {
      return await archive();
    } finally {
      if (claimId !== null) await unclaim(claimId);
    }
  } finally {
    release();
  }
}

/** Survives StrictMode's remount; a real unmount aborts the run, and ends the job when it never started. */
export function archiveRunLifecycle(onAbandoned: () => void, defer: (run: () => void) => void = queueMicrotask) {
  const controller = new AbortController();
  let mounted = false;
  let started = false;
  return {
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      defer(() => {
        if (mounted) return;
        controller.abort();
        if (!started) {
          started = true;
          onAbandoned();
        }
      });
    },
    start(): AbortSignal | null {
      if (started || controller.signal.aborted) return null;
      started = true;
      return controller.signal;
    },
    stop() {
      controller.abort();
    },
  };
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
  return `Skipped ${plural(skipped, "thread")} with uncommitted changes${kept ? ` and ${plural(kept, "thread")} kept with them` : ""}`;
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
  unchecked = 0,
  stop,
  error,
}: {
  archived: number;
  skipped: number;
  kept: number;
  changed: number;
  unchecked?: number;
  stop: ArchiveRunStop | null;
  error?: string;
}): FoldArchiveOutcome | null {
  if (stop === "busy") return { tone: "info", title: "Another fold is still archiving" };
  const runSkips = [changed > 0 ? `Skipped ${plural(changed, "thread")} that got changes since` : null,
    unchecked > 0 ? `Skipped ${plural(unchecked, "thread")} whose worktrees couldn't be checked` : null,
  ].filter((part) => part !== null);
  const skips = [skippedSummary({ skipped, kept }), ...runSkips].filter((part) => part !== null);
  const reason = stop === "error" ? `Archiving failed: ${error ?? "unknown error"}` : stop ? STOP_REASON[stop] : undefined;
  if (reason) return { tone: stop === "unavailable" || stop === "error" ? "error" : "warning", title: archived > 0 ? `Archived ${plural(archived, "thread")}` : "Archive stopped", description: [reason, ...skips].join(". ") };
  if (archived === 0) {
    // The confirm button already showed the plan's skips; a cancel only reports what the run itself skipped.
    const unseen = stop ? runSkips : skips;
    return unseen.length > 0 ? { tone: "warning", title: "Nothing archived", description: unseen.join(". ") } : null;
  }
  const description = [...skips, ...(stop ? ["Stopped before the rest"] : [])].join(". ");
  if (!description) return null;
  return { tone: stop ? "warning" : "success", title: `Archived ${plural(archived, "thread")}`, description };
}
