type SidebarEntry = { status?: unknown; latestAttentionAt?: unknown; hasPendingInteraction?: unknown };

/** Changes whenever the orchestrator starts or ends a turn, asks for attention or opens a prompt. */
export function turnSignal(thread: SidebarEntry | undefined): string | null {
  if (!thread) return null;
  return JSON.stringify([thread.status ?? null, thread.latestAttentionAt ?? null, thread.hasPendingInteraction === true]);
}

/** Calls `onChange` for each signal after the first; a missing signal never fires. */
export function changeWatcher(onChange: () => void): (signal: string | null) => void {
  let last: string | null = null;
  return (signal) => {
    if (signal === null) return;
    if (last !== null && signal !== last) onChange();
    last = signal;
  };
}
