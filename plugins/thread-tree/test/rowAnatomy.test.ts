import { test } from "node:test";
import assert from "node:assert/strict";
import { providerTintColor } from "../src/providerTint.ts";
import { folderAttentionByUrl, prActionReason, prTooltip, rowPullRequest } from "../src/prAttention.ts";
import { familyRootOf, sharedBranchThreads, sharedBranchTooltip, type BranchThread } from "../src/sharedBranch.ts";
import { createRefreshScheduler } from "../src/refreshScheduler.ts";
import type { ThreadPullRequest } from "../src/threadPullRequests.ts";
import type { GithubFolderItem } from "../src/githubFolder.ts";

test("each known provider has its own light and dark tint; monochrome and unknown use the text colour", () => {
  const claude = providerTintColor("claude-code", "tint");
  const codex = providerTintColor("codex", "tint");
  assert.match(claude ?? "", /^light-dark\(#\w{6}, #\w{6}\)$/);
  assert.match(codex ?? "", /^light-dark\(#\w{6}, #\w{6}\)$/);
  assert.notEqual(claude, codex);
  assert.equal(providerTintColor("claude-code", "monochrome"), null);
  assert.equal(providerTintColor("someone-new", "tint"), null);
});

test("Codex uses its brand blue-violet, not ChatGPT green", () => {
  assert.equal(providerTintColor("codex", "tint"), "light-dark(#3941FF, #7A9DFF)");
  assert.equal(providerTintColor("openai", "tint"), providerTintColor("codex", "tint"));
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
  parentThreadId: null,
  environment: env ? { id: `env-${id}`, branchName: null, path: null, isWorktree: true, providerId: "git-worktree", ...env } : null,
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

test("a checkout of unknown type or with no environment provider is the project's own and never warns", () => {
  const shared = sharedBranchThreads([
    bt("u1", { branchName: "main", path: "/repo", isWorktree: null }),
    bt("u2", { branchName: "main", path: "/repo", isWorktree: null }),
    bt("o1", { branchName: "dev", path: "/repo2", providerId: null }),
    bt("o2", { branchName: "dev", path: "/repo2", providerId: null }),
  ]);
  assert.equal(shared.size, 0);
});

test("a thread's family is its topmost parent by parentThreadId, wherever the sidebar draws it", () => {
  const rootOf = familyRootOf([
    { id: "orch", parentThreadId: null },
    { id: "pinned-kid", parentThreadId: "orch" },
    { id: "grandkid", parentThreadId: "pinned-kid" },
    { id: "orphan", parentThreadId: "gone" },
    { id: "loop-a", parentThreadId: "loop-b" },
    { id: "loop-b", parentThreadId: "loop-a" },
  ]);
  assert.equal(rootOf("pinned-kid"), "orch");
  assert.equal(rootOf("grandkid"), "orch");
  assert.equal(rootOf("orch"), "orch");
  assert.equal(rootOf("orphan"), "gone");
  assert.ok(["loop-a", "loop-b"].includes(rootOf("loop-a")));
  const shared = sharedBranchThreads([
    bt("orch", { branchName: "feature/x" }),
    bt("pinned-kid", { branchName: "feature/x" }, { parentThreadId: "orch" }),
  ], rootOf);
  assert.equal(shared.size, 0);
});

test("an orchestrator and its subthreads share a branch by design and never warn about each other", () => {
  const family: Record<string, string> = { root: "root", kid: "root", stranger: "stranger" };
  const shared = sharedBranchThreads([
    bt("root", { branchName: "feature/x" }),
    bt("kid", { branchName: "feature/x" }),
    bt("stranger", { branchName: "feature/x" }),
  ], (id) => family[id]!);
  assert.deepEqual(shared.get("root")?.map((t) => t.id), ["stranger"]);
  assert.deepEqual(shared.get("kid")?.map((t) => t.id), ["stranger"]);
  assert.deepEqual(shared.get("stranger")?.map((t) => t.id), ["root", "kid"]);
});

test("the warning names the other threads, two at most", () => {
  assert.equal(sharedBranchTooltip("feature/x", [{ displayTitle: "Other" }]), "Branch feature/x is also used by “Other”");
  assert.equal(sharedBranchTooltip(null, [{ displayTitle: "A" }, { displayTitle: "B" }, { displayTitle: "C" }]), "This worktree is also used by “A”, “B” and 1 more");
});

function fakeTimers() {
  let clock = 0;
  let next = 1;
  const intervals = new Map<number, () => void>();
  const timeouts = new Map<number, () => void>();
  return {
    intervals,
    timeouts,
    advance(ms: number) { clock += ms; },
    timers: {
      setInterval: (run: () => void) => { intervals.set(next, run); return next++; },
      clearInterval: (id: number) => void intervals.delete(id),
      setTimeout: (run: () => void) => { timeouts.set(next, run); return next++; },
      clearTimeout: (id: number) => void timeouts.delete(id),
      now: () => clock,
    },
  };
}

function scheduled() {
  const fake = fakeTimers();
  const calls: string[] = [];
  const scheduler = createRefreshScheduler({
    refreshAll: () => calls.push("all"),
    refreshKeys: (keys) => calls.push(keys.sort().join(",")),
    intervalMs: 60_000,
    debounceMs: 500,
    timers: fake.timers,
  });
  return { fake, calls, scheduler };
}

test("the PR refresh ticks only while shown and dispose stops it", () => {
  const { fake, calls, scheduler } = scheduled();
  assert.equal(fake.intervals.size, 0);
  scheduler.setShown(true);
  assert.equal(fake.intervals.size, 1);
  assert.deepEqual(calls, []);
  [...fake.intervals.values()][0]!();
  assert.deepEqual(calls, ["all"]);
  scheduler.setShown(false);
  assert.equal(fake.intervals.size, 0);
  scheduler.setShown(true);
  scheduler.dispose();
  assert.equal(fake.intervals.size, 0);
});

test("showing the sidebar again refreshes only when a tick fell due while it was hidden", () => {
  const { fake, calls, scheduler } = scheduled();
  scheduler.setShown(true);
  fake.advance(10_000);
  scheduler.setShown(false);
  fake.advance(5_000);
  scheduler.setShown(true);
  assert.deepEqual(calls, []);
  scheduler.setShown(false);
  fake.advance(60_000);
  scheduler.setShown(true);
  assert.deepEqual(calls, ["all"]);
});

test("activity refetches only the changed keys, debounced, and waits while hidden", () => {
  const { fake, calls, scheduler } = scheduled();
  scheduler.setShown(true);
  scheduler.requestKeys(["a"]);
  scheduler.requestKeys(["b", "a"]);
  assert.equal(fake.timeouts.size, 1);
  [...fake.timeouts.values()][0]!();
  assert.deepEqual(calls, ["a,b"]);
  scheduler.setShown(false);
  scheduler.requestKeys(["c"]);
  assert.deepEqual(calls, ["a,b"]);
  scheduler.setShown(true);
  assert.deepEqual(calls, ["a,b", "c"]);
  scheduler.requestKeys([]);
  assert.equal([...fake.timeouts.keys()].length <= 1, true);
});
