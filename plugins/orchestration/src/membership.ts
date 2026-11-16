import type { Subtask } from "./contract.ts";

export function relatedThreadIds(root: string, subtasks: readonly Subtask[], parents: ReadonlyMap<string, string | null | undefined>): Set<string> {
  const related = new Set([root, ...subtasks.flatMap((task) => task.threadId ? [task.threadId] : [])]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, parent] of parents) {
      if (parent && related.has(parent) && !related.has(id)) {
        related.add(id);
        changed = true;
      }
    }
  }
  return related;
}
