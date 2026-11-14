import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentReviewPrompt,
  mergeEnvironmentOf,
  projectForRepo,
  pullRequestActions,
  repoSlugFromPrUrl,
  repoSlugFromRemote,
} from "../src/pullRequestActions.ts";
import type { PullRequestStatusRow } from "../src/threadPullRequests.ts";

test("a project's remote names its GitHub repo in every form git writes it", () => {
  assert.equal(repoSlugFromRemote("git@github.com:dodobrands/Drinkit-Mobile-iOS.git"), "dodobrands/drinkit-mobile-ios");
  assert.equal(repoSlugFromRemote("https://github.com/kartollikaa/bb-plugins.git"), "kartollikaa/bb-plugins");
  assert.equal(repoSlugFromRemote("https://github.com/kartollikaa/bb-plugins"), "kartollikaa/bb-plugins");
  assert.equal(repoSlugFromRemote("ssh://git@github.com/kartollikaa/bb-plugins.git"), "kartollikaa/bb-plugins");
  assert.equal(repoSlugFromRemote("https://gitlab.com/a/b.git"), null);
  assert.equal(repoSlugFromRemote(null), null);
  assert.equal(repoSlugFromPrUrl("https://github.com/Kartollikaa/bb-plugins/pull/12"), "kartollikaa/bb-plugins");
  assert.equal(repoSlugFromPrUrl("https://example.com/a/b/pull/1"), null);
});

test("a repo maps to the most recently updated project with that remote", () => {
  const projects = [
    { id: "old", name: "bb (old)", gitRemoteUrl: "git@github.com:kartollikaa/bb-plugins.git", updatedAt: 1 },
    { id: "new", name: "bb", gitRemoteUrl: "https://github.com/kartollikaa/bb-plugins.git", updatedAt: 5 },
    { id: "other", name: "ios", gitRemoteUrl: "git@github.com:dodobrands/drinkit-mobile-ios.git", updatedAt: 9 },
    { id: "personal", name: "Personal", gitRemoteUrl: null, updatedAt: 10 },
  ];
  assert.deepEqual(projectForRepo("Kartollikaa/BB-plugins", projects), { projectId: "new", name: "bb" });
  assert.equal(projectForRepo("someone/else", projects), null);
});

const available = (url: string, state: "open" | "draft" | "merged" | "closed" = "open"): PullRequestStatusRow => ({
  outcome: "available",
  pullRequest: { number: 1, title: "t", url, state, attention: "none", checks: { state: "passing" } },
});

test("a PR merges through the environment whose current branch holds it, while it is open", () => {
  const url = "https://github.com/o/r/pull/7";
  assert.equal(mergeEnvironmentOf(url, { e1: available("https://github.com/o/r/pull/8"), e2: available(url.toUpperCase()) }), "e2");
  assert.equal(mergeEnvironmentOf(url, { e1: available(url, "draft") }), null, "a draft isn't mergeable");
  assert.equal(mergeEnvironmentOf(url, { e1: available(url, "merged") }), null);
  assert.equal(mergeEnvironmentOf(url, { e1: { outcome: "absent" }, e2: undefined }), null);
});

test("Merge needs GitHub's ready signal and an environment; Agent review needs no thread and a project for the repo", () => {
  const base = { attention: ["ready"] as const, threadId: "t1", mergeEnvironmentId: "e1", reviewProject: { projectId: "p", name: "bb" } };
  assert.deepEqual(pullRequestActions(base), { mergeEnvironmentId: "e1", reviewProject: null });
  assert.deepEqual(pullRequestActions({ ...base, attention: ["review"] }), { mergeEnvironmentId: null, reviewProject: null });
  assert.deepEqual(pullRequestActions({ ...base, mergeEnvironmentId: null }), { mergeEnvironmentId: null, reviewProject: null });
  assert.deepEqual(pullRequestActions({ ...base, attention: ["review"], threadId: null }), { mergeEnvironmentId: null, reviewProject: { projectId: "p", name: "bb" } });
  assert.deepEqual(pullRequestActions({ ...base, attention: ["review"], threadId: null, reviewProject: null }), { mergeEnvironmentId: null, reviewProject: null });
});

test("the review prompt names the PR and keeps the agent off GitHub and off the checkout's branch", () => {
  const prompt = agentReviewPrompt({ url: "https://github.com/o/r/pull/7", number: 7, title: "Fix it" });
  assert.match(prompt, /https:\/\/github\.com\/o\/r\/pull\/7/);
  assert.match(prompt, /#7/);
  assert.match(prompt, /don't post/i);
  assert.match(prompt, /don't check out/i);
});
