import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentReviewPrompt,
  agentReviewSpawnArgs,
  reviewExecution,
  type ProviderModelCatalog,
  mergeEnvironmentOf,
  projectForRepo,
  pullRequestActions,
  repoSlugFromPrUrl,
  repoSlugFromRemote,
} from "../src/pullRequestActions.ts";
import { readReviewSettings } from "../src/settings.ts";
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
  const prompt = agentReviewPrompt({ url: "https://github.com/o/r/pull/7", number: 7 });
  assert.match(prompt, /https:\/\/github\.com\/o\/r\/pull\/7/);
  assert.match(prompt, /#7/);
  assert.match(prompt, /don't post/i);
  assert.match(prompt, /don't check out/i);
});

const efforts = (...levels: string[]) => levels.map((reasoningEffort) => ({ reasoningEffort }));
const catalogs: ProviderModelCatalog[] = [
  { providerId: "codex", models: [{ model: "gpt-5.5", supportedReasoningEfforts: efforts("minimal", "low", "medium", "high") }] },
  {
    providerId: "claude-code",
    models: [
      { model: "claude-sonnet-5-5", supportedReasoningEfforts: efforts("low", "medium", "high") },
      { model: "claude-opus-5-5", supportedReasoningEfforts: efforts("low", "medium", "high", "xhigh", "max") },
    ],
  },
];
const review = { projectId: "proj_1", url: "https://github.com/a/b/pull/7", number: 7, title: "Fix it" };

test("by default the review spawns on Opus 5.5 at medium reasoning, on the provider that offers it", () => {
  const { reviewModel, reviewReasoningLevel } = readReviewSettings(undefined);
  assert.deepEqual({ reviewModel, reviewReasoningLevel }, { reviewModel: "claude-opus-5-5", reviewReasoningLevel: "medium" });
  const { execution, warning } = reviewExecution({ model: reviewModel, reasoningLevel: reviewReasoningLevel }, catalogs);
  assert.equal(warning, null);
  assert.deepEqual(agentReviewSpawnArgs({ ...review, execution }), {
    projectId: "proj_1",
    environment: { type: "project-default" },
    title: "Review #7 Fix it",
    prompt: agentReviewPrompt({ url: review.url, number: 7 }),
    providerId: "claude-code",
    model: "claude-opus-5-5",
    reasoningLevel: "medium",
    executionInputSources: { providerId: "explicit", model: "explicit", reasoningLevel: "explicit" },
  });
});

test("the chosen model and reasoning level reach the spawn", () => {
  const { reviewModel, reviewReasoningLevel } = readReviewSettings({ reviewModel: " gpt-5.5 ", reviewReasoningLevel: "high" });
  const { execution } = reviewExecution({ model: reviewModel, reasoningLevel: reviewReasoningLevel }, catalogs);
  const args = agentReviewSpawnArgs({ ...review, execution });
  assert.equal(args.providerId, "codex");
  assert.equal(args.model, "gpt-5.5");
  assert.equal(args.reasoningLevel, "high");
});

test("Model default leaves reasoning to the model, and an unsupported level is dropped with a warning", () => {
  const modelDefault = reviewExecution({ model: "claude-opus-5-5", reasoningLevel: "default" }, catalogs);
  assert.equal(modelDefault.warning, null);
  assert.equal("reasoningLevel" in modelDefault.execution, false);
  assert.deepEqual(modelDefault.execution.executionInputSources, { providerId: "explicit", model: "explicit" });

  const unsupported = reviewExecution({ model: "claude-sonnet-5-5", reasoningLevel: "max" }, catalogs);
  assert.equal(unsupported.execution.model, "claude-sonnet-5-5");
  assert.equal("reasoningLevel" in unsupported.execution, false);
  assert.match(unsupported.warning ?? "", /doesn't support reasoning level max/);
});

test("a model whose provider doesn't list its reasoning levels still gets the chosen level", () => {
  const unknown: ProviderModelCatalog[] = [{ providerId: "acp", models: [{ model: "m", reasoningDiscovery: "unknown", supportedReasoningEfforts: [] }] }];
  assert.equal(reviewExecution({ model: "m", reasoningLevel: "high" }, unknown).execution.reasoningLevel, "high");
});

test("a blank model or one no available provider offers keeps the project's defaults", () => {
  const blank = reviewExecution({ model: "  ", reasoningLevel: "medium" }, catalogs);
  assert.deepEqual(blank, { execution: {}, warning: null });
  const missing = reviewExecution({ model: "claude-opus-9", reasoningLevel: "medium" }, catalogs);
  assert.deepEqual(missing.execution, {});
  assert.match(missing.warning ?? "", /No available provider offers claude-opus-9/);
  const args = agentReviewSpawnArgs({ ...review, execution: missing.execution });
  assert.deepEqual(Object.keys(args).sort(), ["environment", "projectId", "prompt", "title"]);
});

test("off-type stored review settings fall back to their defaults", () => {
  assert.deepEqual(readReviewSettings({ reviewModel: 5, reviewReasoningLevel: "turbo" }), { reviewModel: "claude-opus-5-5", reviewReasoningLevel: "medium" });
  assert.deepEqual(readReviewSettings({ reviewModel: "", reviewReasoningLevel: "default" }), { reviewModel: "", reviewReasoningLevel: "default" });
});
