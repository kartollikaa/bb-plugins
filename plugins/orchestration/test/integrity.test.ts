import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSubtaskCoverage } from "../src/integrity.ts";
import { summarizeExport } from "../src/ledger.ts";

const exported = (ids: string[]) => summarizeExport({ schema: "orchestrate-ledger-export", version: 1, subtasks: ids.map((id) => ({ id, status: { value: "verified" } })) }, "/ledger.md");
const markdown = `## Subtasks
| id | Session | Status |
|---|---|---|
| T1 Completed | thr_example | verified |

| T2 Active child | thr_worker | working |
## Brief
| T3 Narrative only | no session | verified |
`;

test("split Subtasks table cannot silently lose rows from a successful v1 export", () => {
  assert.throws(() => assertSubtaskCoverage(markdown, exported(["T1"])), /rows missing from the export/);
  assert.doesNotThrow(() => assertSubtaskCoverage(markdown, exported(["T1", "T2"])));
});

test("coverage accepts localized/annotated headings and ignores examples and prose", () => {
  assert.throws(() => assertSubtaskCoverage(markdown.replace("Subtasks", "Подзадачи (current)"), exported(["T1"])), /rows missing/);
  assert.doesNotThrow(() => assertSubtaskCoverage("## Subtasks\n```md\n| T9 example | planned |\n```\n## Brief\nActive T9 in prose", exported([])));
});
