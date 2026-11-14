import { test } from "node:test";
import assert from "node:assert/strict";
import { diffStatEnvironmentOf, diffStatOf, formatDiffStat, type DiffStatThread } from "../src/diffStat.ts";

const files = (...paths: string[]) => paths.map((path) => ({ path, status: "M", insertions: 1, deletions: 0 }));
const side = (insertions: number, deletions: number, paths: string[], extra: Record<string, unknown> = {}) => ({
  insertions, deletions, lineStatsComplete: true, fileCount: paths.length, files: files(...paths), ...extra,
});
const row = (workingTree: unknown, mergeBase: unknown) => ({ outcome: "available", workspace: { workingTree, mergeBase } });

test("a result's diff is its committed branch plus what is still uncommitted, each file counted once", () => {
  assert.deepEqual(diffStatOf(row(side(5, 1, ["a.ts", "new.ts"]), side(820, 35, ["a.ts", "b.ts", "c.ts"]))), { insertions: 825, deletions: 36, files: 4, linesComplete: true });
  assert.deepEqual(diffStatOf(row(side(91, 0, ["notes.md"]), null)), { insertions: 91, deletions: 0, files: 1, linesComplete: true }, "no merge base: the working tree alone");
});

test("no diff, an unavailable read or a malformed row shows nothing", () => {
  assert.equal(diffStatOf(row(side(0, 0, []), side(0, 0, []))), null);
  assert.equal(diffStatOf({ outcome: "unavailable", failure: "offline" }), null);
  assert.equal(diffStatOf({ outcome: "not_applicable" }), null);
  assert.equal(diffStatOf(undefined), null);
  assert.equal(diffStatOf({ outcome: "available", workspace: { workingTree: { insertions: "x" } } }), null);
});

test("a file list cut short counts files by the reported totals", () => {
  const stat = diffStatOf(row(side(1, 0, ["a.ts"], { fileCount: 3 }), side(2, 0, ["a.ts"])));
  assert.equal(stat?.files, 4);
});

test("incomplete line stats keep the file count and drop the lines", () => {
  const stat = diffStatOf(row(side(0, 0, []), side(10, 2, ["a.ts", "b.ts"], { lineStatsComplete: false })))!;
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
