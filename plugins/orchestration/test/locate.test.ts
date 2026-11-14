import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareVersions, exportScriptCandidates, ledgerFor, scanLedgers } from "../src/locate.ts";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "orchestration-test-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test("finds ledgers by their first line, newest wins", async () => {
  const root = tree({
    "projects/-a/orchestrate/one.md": "Orchestrator: thr_aaa\nBackend: x\n",
    "projects/-a/orchestrate/old.md": "Orchestrator: thr_aaa\n",
    "projects/-b/orchestrate/two.md": "Оркестратор: thr_bbb\n",
    "projects/-b/orchestrate/notes.md": "# not a ledger\n",
    "projects/-b/orchestrate/two/scratch.md": "Orchestrator: thr_ccc\n",
    "projects/-c/memory/x.md": "Orchestrator: thr_ddd\n",
  });
  utimesSync(join(root, "projects/-a/orchestrate/old.md"), new Date(2020, 0, 1), new Date(2020, 0, 1));
  const ledgers = await scanLedgers(join(root, "projects"));
  assert.deepEqual(ledgers.map((l) => l.orchestratorId).sort(), ["thr_aaa", "thr_aaa", "thr_bbb"]);
  assert.match(ledgerFor(ledgers, "thr_aaa")!.path, /one\.md$/);
  assert.equal(ledgerFor(ledgers, "thr_ccc"), null, "subdirectories are scratch, not ledgers");
  assert.equal(ledgerFor(ledgers, "thr_zzz"), null);
  assert.deepEqual(await scanLedgers(join(root, "missing")), []);
});

test("export script candidates: the setting alone, else newest installed first, then checkouts", async () => {
  const script = "scripts/orchestration_ledger.py";
  const root = tree({
    [`plugins/cache/hub/orchestrate/0.9.0/${script}`]: "",
    [`plugins/cache/hub/orchestrate/0.11.0/${script}`]: "",
    [`plugins/cache/hub/orchestrate/0.10.0/${script}`]: "",
    [`plugins/cache/hub/orchestrate/temp/${script}`]: "",
    [`plugins/marketplaces/hub/plugins/orchestrate/${script}`]: "",
  });
  const found = await exportScriptCandidates("", root);
  assert.deepEqual(found.map((p) => p.slice(root.length)), [
    `/plugins/cache/hub/orchestrate/0.11.0/${script}`,
    `/plugins/cache/hub/orchestrate/0.10.0/${script}`,
    `/plugins/cache/hub/orchestrate/0.9.0/${script}`,
    `/plugins/marketplaces/hub/plugins/orchestrate/${script}`,
  ]);
  assert.deepEqual(await exportScriptCandidates(" /x/y.py ", root), ["/x/y.py"]);
  assert.ok(compareVersions("0.11.0", "0.9.9") > 0);
});
