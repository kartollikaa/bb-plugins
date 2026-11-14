/** Runs bb's Archive on each root in turn; a root left unarchived means the user cancelled bb's confirmation, so the rest aren't asked. */
export async function archiveInTurn(
  rootIds: readonly string[],
  actionOf: (id: string) => (() => Promise<void>) | undefined,
  isArchived: (id: string) => Promise<boolean>,
): Promise<{ archived: string[]; stopped: boolean }> {
  const archived: string[] = [];
  for (const id of rootIds) {
    const run = actionOf(id);
    if (!run) return { archived, stopped: true };
    await run();
    if (!(await isArchived(id))) return { archived, stopped: true };
    archived.push(id);
  }
  return { archived, stopped: false };
}

/** bb's Archive settles before the server records the archive, so the check is retried a few times. */
export async function settlesTrue(
  check: () => Promise<boolean>,
  { attempts, delayMs, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }: { attempts: number; delayMs: number; sleep?: (ms: number) => Promise<void> },
): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    if (await check()) return true;
    if (attempt >= attempts) return false;
    await sleep(delayMs);
  }
}
