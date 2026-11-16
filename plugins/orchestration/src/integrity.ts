import type { LedgerSummary } from "./contract.ts";

export class LedgerIntegrityError extends Error {}

export function assertSubtaskCoverage(markdown: string, summary: LedgerSummary): void {
  let inSubtasks = false;
  let fence: { marker: string; length: number } | null = null;
  const exported = new Set(summary.subtasks.map((task) => task.id));
  const missing = new Set<string>();
  for (const line of markdown.split(/\r?\n/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (delimiter && delimiter[1]![0] === fence.marker && delimiter[1]!.length >= fence.length && !delimiter[2]!.trim()) fence = null;
      continue;
    }
    if (delimiter && (delimiter[1]![0] !== "`" || !delimiter[2]!.includes("`"))) {
      fence = { marker: delimiter[1]![0]!, length: delimiter[1]!.length };
      continue;
    }
    const heading = /^#{1,2}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) inSubtasks = /^(?:Subtasks|Подзадачи)(?: \(.*\))?$/i.test(heading[1]!);
    if (!inSubtasks) continue;
    const id = /^\s*\|\s*([A-Z]+\d+[a-z]*)(?=[\s|:])/u.exec(line)?.[1];
    if (id && !exported.has(id)) missing.add(id);
  }
  if (missing.size) throw new LedgerIntegrityError("The Subtasks table contains rows missing from the export. Repair split or malformed tables before trusting completion counts.");
}
