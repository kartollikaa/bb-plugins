/** Archives this close together came from one action: a parent and the children it took along. */
export const ARCHIVE_BATCH_GAP_MS = 2_000;
/** Older archives are not undone by a keystroke; the archived view still restores them. */
export const ARCHIVE_UNDO_WINDOW_MS = 10 * 60_000;
const MAX_ENTRIES = 200;

interface ArchiveEntry {
  threadId: string;
  title: string;
  at: number;
}

export interface ArchiveBatch {
  /** Newest archive first, so the thread the user clicked comes back before the ones it pulled along. */
  threads: readonly { threadId: string; title: string }[];
}

export interface ArchiveHistory {
  record(threadId: string, title: string): void;
  forget(threadId: string): void;
  takeLatestBatch(): ArchiveBatch | null;
}

export function createArchiveHistory(now: () => number = Date.now): ArchiveHistory {
  let entries: ArchiveEntry[] = [];

  const prune = () => {
    const oldest = now() - ARCHIVE_UNDO_WINDOW_MS;
    entries = entries.filter((entry) => entry.at >= oldest).slice(-MAX_ENTRIES);
  };

  return {
    record(threadId, title) {
      entries = entries.filter((entry) => entry.threadId !== threadId);
      entries.push({ threadId, title, at: now() });
      prune();
    },
    forget(threadId) {
      entries = entries.filter((entry) => entry.threadId !== threadId);
    },
    takeLatestBatch() {
      prune();
      if (entries.length === 0) return null;
      let start = entries.length - 1;
      while (start > 0 && entries[start]!.at - entries[start - 1]!.at <= ARCHIVE_BATCH_GAP_MS) start -= 1;
      const batch = entries.slice(start).reverse();
      entries = entries.slice(0, start);
      return { threads: batch.map(({ threadId, title }) => ({ threadId, title })) };
    },
  };
}

/** Undo keystroke: Cmd+Z or Ctrl+Z without Shift or Alt, which mean redo or something else. */
export function isUndoKey(event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

/** Threads that left the active list since the last render: archived, deleted or hidden. */
export function removedThreadIds(previous: ReadonlySet<string>, current: readonly string[]): string[] {
  const now = new Set(current);
  return [...previous].filter((id) => !now.has(id));
}

/**
 * Inside a text field Cmd+Z goes to the archive only when nothing was typed since it, so undo follows
 * the order things happened: archiving the open chat focuses its composer, which holds no newer edit.
 */
export function archiveIsNewerThanTyping(latestArchiveAt: number | undefined, lastTypedAt: number): boolean {
  return latestArchiveAt !== undefined && latestArchiveAt > lastTypedAt;
}
