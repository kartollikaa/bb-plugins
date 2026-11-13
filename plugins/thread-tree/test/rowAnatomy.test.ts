import { test } from "node:test";
import assert from "node:assert/strict";
import { providerTintClass, PROVIDER_MONOCHROME } from "../src/providerTint.ts";
import { folderAttentionByUrl, prActionReason, prTooltip, rowPullRequest } from "../src/prAttention.ts";
import { sharedBranchThreads, sharedBranchTooltip, type BranchThread } from "../src/sharedBranch.ts";
import { createRefreshScheduler } from "../src/refreshScheduler.ts";
import type { ThreadPullRequest } from "../src/threadPullRequests.ts";
import type { GithubFolderItem } from "../src/githubFolder.ts";

test("each known provider has its own light and dark tint; monochrome and unknown use the text colour", () => {
  const claude = providerTintClass("claude-code", "tint");
  const codex = providerTintClass("codex", "tint");
  assert.match(claude, /^text-\[#\w{6}\] dark:text-\[#\w{6}\]$/);
  assert.match(codex, /^text-\[#\w{6}\] dark:text-\[#\w{6}\]$/);
  assert.notEqual(claude, codex);
  assert.equal(providerTintClass("claude-code", "monochrome"), PROVIDER_MONOCHROME);
  assert.equal(providerTintClass("someone-new", "tint"), PROVIDER_MONOCHROME);
});

const pr = (extra: Partial<ThreadPullRequest> = {}): ThreadPullRequest => ({
  number: 7,
  title: "Fix it",
  url: "https://github.com/o/r/pull/7",
  state: "open",
  attention: "none",
  checks: { state: "passing" },
  ...extra,
});

const folderItem = (url: string, attention: GithubFolderItem["attention"]): GithubFolderItem => ({
  pr: { url, number: 7, title: "Fix it", repo: "o/r", author: "me", isDraft: false, updatedAt: "" },
  attention,
  snoozeKey: url,
});

const none = folderAttentionByUrl([]);

test("each of the four reasons earns the icon from its source", () => {
  assert.equal(prActionReason(pr({ checks: { state: "failing" } }), none), "failing");
  assert.equal(prActionReason(pr({ attention: "conflicts" }), none), "conflicts");
  const url = "https://github.com/o/r/pull/7";
  assert.equal(prActionReason(pr(), folderAttentionByUrl([folderItem(url.toUpperCase(), ["changes_requested"])])), "changes");
  assert.equal(prActionReason(pr(), folderAttentionByUrl([folderItem(url, ["ready"])])), "ready");
  assert.equal(prActionReason(pr(), folderAttentionByUrl([folderItem(url, ["ci_failed"])])), "failing");
});

test("a quiet, merged or closed PR earns nothing; without GitHub Folder only Failing and Conflicts show", () => {
  assert.equal(prActionReason(pr(), none), null);
  assert.equal(prActionReason(pr({ checks: { state: "pending" } }), none), null);
  assert.equal(prActionReason(pr({ state: "merged", checks: { state: "failing" } }), none), null);
  assert.equal(prActionReason(pr({ state: "closed", attention: "conflicts" }), none), null);
  const ready = folderAttentionByUrl([folderItem("https://github.com/o/r/pull/7", ["review"])]);
  assert.equal(prActionReason(pr(), ready), null);
});

test("a row shows its most urgent PR, and none on a failed thread", () => {
  const prs = [pr({ url: "https://github.com/o/r/pull/1", number: 1 }), pr({ url: "https://github.com/o/r/pull/2", number: 2, attention: "conflicts" }), pr({ url: "https://github.com/o/r/pull/3", number: 3, checks: { state: "failing" } })];
  assert.equal(rowPullRequest(prs, none, false)?.pr.number, 3);
  assert.equal(rowPullRequest(prs, none, true), null);
  assert.equal(rowPullRequest([pr()], none, false), null);
  assert.equal(prTooltip({ pr: pr({ checks: { state: "failing" } }), reason: "failing" }), "PR #7: Fix it · Checks failing");
});

const bt = (id: string, env: Partial<NonNullable<BranchThread["environment"]>> | null, extra: Partial<BranchThread> = {}): BranchThread => ({
  id,
  projectId: "p",
  displayTitle: id.toUpperCase(),
  isArchived: false,
  isHidden: false,
  environment: env ? { id: `env-${id}`, branchName: null, path: null, isWorktree: true, ...env } : null,
  ...extra,
});

test("two live threads on one branch or one worktree warn about each other", () => {
  const shared = sharedBranchThreads([
    bt("a", { branchName: "feature/x", path: "/w/a" }),
    bt("b", { branchName: "feature/x", path: "/w/b" }),
    bt("c", { branchName: "feature/y", path: "/w/c" }),
    bt("d", { branchName: "feature/z", path: "/w/c" }),
  ]);
  assert.deepEqual(shared.get("a")?.map((t) => t.id), ["b"]);
  assert.deepEqual(shared.get("b")?.map((t) => t.id), ["a"]);
  assert.deepEqual(shared.get("c")?.map((t) => t.id), ["d"]);
  assert.equal(shared.has("e"), false);
});

test("archived and hidden threads, other projects, the project checkout and missing environments never warn", () => {
  const shared = sharedBranchThreads([
    bt("a", { branchName: "feature/x" }),
    bt("arch", { branchName: "feature/x" }, { isArchived: true }),
    bt("hid", { branchName: "feature/x" }, { isHidden: true }),
    bt("other", { branchName: "feature/x" }, { projectId: "q" }),
    bt("m1", { branchName: "main", path: "/repo", isWorktree: false }),
    bt("m2", { branchName: "main", path: "/repo", isWorktree: false }),
    bt("none", null),
  ]);
  assert.equal(shared.size, 0);
});

test("the warning names the other threads", () => {
  assert.equal(sharedBranchTooltip("feature/x", [{ displayTitle: "Other" }]), "Branch feature/x is also used by “Other”");
});

test("the PR refresh ticks only while shown and catches up once when shown again", () => {
  const timers = new Map<number, () => void>();
  let next = 1;
  let refreshes = 0;
  const scheduler = createRefreshScheduler(() => refreshes++, 60_000, {
    setInterval: (run) => { timers.set(next, run); return next++; },
    clearInterval: (id) => void timers.delete(id),
  });
  assert.equal(timers.size, 0);
  scheduler.setShown(true);
  assert.equal(timers.size, 1);
  assert.equal(refreshes, 0);
  [...timers.values()][0]!();
  assert.equal(refreshes, 1);
  scheduler.setShown(false);
  assert.equal(timers.size, 0);
  scheduler.setShown(true);
  assert.equal(refreshes, 2);
  assert.equal(timers.size, 1);
  scheduler.dispose();
  assert.equal(timers.size, 0);
});
