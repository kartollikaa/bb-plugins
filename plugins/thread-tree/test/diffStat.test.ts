import { test } from "node:test";
import assert from "node:assert/strict";
import { diffStatEnvironmentOf, diffStatOf, formatDiffStat, type DiffStatThread } from "../src/diffStat.ts";

const all = (insertions: number, deletions: number, fileCount: number, lineStatsComplete = true) => ({ insertions, deletions, fileCount, lineStatsComplete });
const side = (insertions: number, deletions: number, fileCount: number) => ({ insertions, deletions, lineStatsComplete: true, fileCount, files: [] });
const row = (allChanges: unknown, extra: Record<string, unknown> = {}) => ({ outcome: "available", workspace: { workingTree: side(0, 2, 1), mergeBase: side(4, 0, 1), allChanges, ...extra } });

test("a result's diff is the net change from its merge base to the worktree, not committed plus uncommitted", () => {
  assert.deepEqual(diffStatOf(row(all(2, 0, 1))), { insertions: 2, deletions: 0, files: 1, linesComplete: true }, "4 lines committed, 2 of them deleted uncommitted");
  assert.deepEqual(diffStatOf(row(all(825, 36, 4))), { insertions: 825, deletions: 36, files: 4, linesComplete: true });
});

test("no diff, an unavailable read or a malformed row shows nothing", () => {
  assert.equal(diffStatOf(row(all(0, 0, 0))), null);
  assert.equal(diffStatOf({ outcome: "unavailable", failure: "offline" }), null);
  assert.equal(diffStatOf({ outcome: "not_applicable" }), null);
  assert.equal(diffStatOf(undefined), null);
  assert.equal(diffStatOf(row({ insertions: "x" })), null);
  assert.equal(diffStatOf(row(undefined)), null, "a row without allChanges isn't read from its parts");
});

test("incomplete line stats keep the file count and drop the lines", () => {
  const stat = diffStatOf(row(all(10, 2, 2, false)))!;
  assert.equal(stat.linesComplete, false);
  assert.equal(formatDiffStat(stat), "2 files");
  assert.equal(formatDiffStat({ insertions: 825, deletions: 36, files: 4, linesComplete: true }), "+825 −36 · 4 files");
  assert.equal(formatDiffStat({ insertions: 3, deletions: 0, files: 1, linesComplete: true }), "+3 −0 · 1 file");
});

const t = (id: string, environment: DiffStatThread["environment"], extra: Partial<DiffStatThread> = {}): DiffStatThread => ({ id, isArchived: false, environment, ...extra });
const worktree = (id: string) => ({ id, isWorktree: true });

test("a thread's diff is its own only on a worktree no other thread outside its subtree uses", () => {
  const threads = [
    t("own", worktree("e1")),
    t("parent", worktree("e2")),
    t("reviewer", worktree("e2")),
    t("plain", { id: "e3", isWorktree: false }),
    t("unknown", { id: "e4", isWorktree: null }),
    t("none", null),
    t("peer-a", worktree("e5")),
    t("peer-b", worktree("e5")),
    t("gone-sibling", worktree("e1"), { isArchived: true }),
  ];
  const descendants: Record<string, string[]> = { parent: ["reviewer"] };
  const of = (id: string) => diffStatEnvironmentOf(threads.find((thread) => thread.id === id)!, threads, (threadId) => descendants[threadId] ?? []);
  assert.equal(of("own"), "e1", "an archived thread on the same worktree doesn't share it");
  assert.equal(of("parent"), "e2", "its reviewers work in its worktree");
  assert.equal(of("reviewer"), null, "the parent's diff isn't the reviewer's result");
  assert.equal(of("plain"), null, "a plain checkout holds everyone's work");
  assert.equal(of("unknown"), null);
  assert.equal(of("none"), null);
  assert.equal(of("peer-a"), null);
});
