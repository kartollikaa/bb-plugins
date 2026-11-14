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
