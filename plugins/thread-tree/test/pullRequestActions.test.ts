import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentReviewPrompt,
  agentReviewSpawnArgs,
  catalogOffers,
  encodeReviewModel,
  parseReviewModel,
  reviewExecution,
  reviewProviderOrder,
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
  {
    providerId: "alpha",
    models: [
      { model: "shared-model", defaultReasoningEffort: "medium", supportedReasoningEfforts: efforts("low", "medium") },
      { model: "alpha-only", defaultReasoningEffort: "low", supportedReasoningEfforts: efforts("minimal", "low", "medium", "high") },
    ],
  },
  {
    providerId: "beta",
    models: [
      { model: "shared-model", defaultReasoningEffort: "high", supportedReasoningEfforts: efforts("medium", "high", "max") },
      { model: "beta-only", defaultReasoningEffort: "high", supportedReasoningEfforts: efforts("low", "high", "max") },
    ],
  },
];
const review = { projectId: "proj_1", url: "https://github.com/a/b/pull/7", number: 7, title: "Fix it" };

test("by default the review passes no model or reasoning, so bb uses the project's defaults", () => {
  const settings = readReviewSettings(undefined);
  assert.deepEqual(settings, { reviewModel: "", reviewReasoningLevel: "default" });
  const { execution, warning } = reviewExecution({ model: settings.reviewModel, reasoningLevel: settings.reviewReasoningLevel }, catalogs);
  assert.equal(warning, null);
  assert.deepEqual(agentReviewSpawnArgs({ ...review, execution }), {
    projectId: "proj_1",
    environment: { type: "project-default" },
    title: "Review #7 Fix it",
    prompt: agentReviewPrompt({ url: review.url, number: 7 }),
  });
});

test("the setting names provider and model together, and a bare id names only the model", () => {
  assert.equal(encodeReviewModel({ providerId: "beta", model: "shared-model" }), "beta/shared-model");
  assert.deepEqual(parseReviewModel("beta/shared-model"), { providerId: "beta", model: "shared-model" });
  assert.deepEqual(parseReviewModel(" shared-model "), { providerId: null, model: "shared-model" });
  assert.deepEqual(parseReviewModel("beta/vendor/model"), { providerId: "beta", model: "vendor/model" });
  assert.deepEqual(parseReviewModel("/model"), { providerId: null, model: "/model" });
  assert.deepEqual(parseReviewModel("beta/"), { providerId: null, model: "beta/" });
  assert.equal(parseReviewModel("  "), null);
});

test("a pinned pair spawns on that provider even when another lists the same model first", () => {
  const { execution, warning } = reviewExecution({ model: "beta/shared-model", reasoningLevel: "max" }, catalogs);
  assert.equal(warning, null);
  assert.deepEqual(agentReviewSpawnArgs({ ...review, execution }), {
    projectId: "proj_1",
    environment: { type: "project-default" },
    title: "Review #7 Fix it",
    prompt: agentReviewPrompt({ url: review.url, number: 7 }),
    providerId: "beta",
    model: "shared-model",
    reasoningLevel: "max",
    executionInputSources: { providerId: "explicit", model: "explicit", reasoningLevel: "explicit" },
  });
});

test("a model only the second provider offers spawns there, pinned or bare", () => {
  for (const model of ["beta/beta-only", "beta-only"]) {
    const { execution, warning } = reviewExecution({ model, reasoningLevel: "low" }, catalogs);
    assert.equal(warning, null, model);
    assert.equal(execution.providerId, "beta", model);
    assert.equal(execution.model, "beta-only", model);
    assert.equal(execution.reasoningLevel, "low", model);
  }
});

test("a bare model id, as saved before the picker, runs on the first provider offering it", () => {
  const { execution } = reviewExecution({ model: "shared-model", reasoningLevel: "medium" }, catalogs);
  assert.equal(execution.providerId, "alpha");
  assert.equal(execution.reasoningLevel, "medium");
});

test("a pinned provider that doesn't offer the model falls back to the project's defaults with a warning", () => {
  const wrongProvider = reviewExecution({ model: "alpha/beta-only", reasoningLevel: "low" }, catalogs);
  assert.deepEqual(wrongProvider.execution, {});
  assert.match(wrongProvider.warning ?? "", /Provider alpha isn't available or doesn't offer beta-only/);
  const missingProvider = reviewExecution({ model: "gamma/shared-model", reasoningLevel: "low" }, catalogs);
  assert.deepEqual(missingProvider.execution, {});
  assert.match(missingProvider.warning ?? "", /Provider gamma isn't available/);
});

test("Model default and an unsupported level both send the model's own default level explicitly", () => {
  const modelDefault = reviewExecution({ model: "beta/shared-model", reasoningLevel: "default" }, catalogs);
  assert.equal(modelDefault.warning, null);
  assert.equal(modelDefault.execution.reasoningLevel, "high");
  assert.deepEqual(modelDefault.execution.executionInputSources, { providerId: "explicit", model: "explicit", reasoningLevel: "explicit" });

  const unsupported = reviewExecution({ model: "alpha/shared-model", reasoningLevel: "max" }, catalogs);
  assert.equal(unsupported.execution.reasoningLevel, "medium");
  assert.match(unsupported.warning ?? "", /doesn't support reasoning level max; the review uses the model's default/);
});

test("a model several providers offer goes to the project's provider when only its id is saved", () => {
  assert.deepEqual(reviewProviderOrder(["alpha", "beta", "pool"], "pool"), ["pool", "alpha", "beta"]);
  assert.deepEqual(reviewProviderOrder(["alpha", "beta"], "gone"), ["alpha", "beta"]);
  assert.deepEqual(reviewProviderOrder(["alpha", "beta"], null), ["alpha", "beta"]);
  assert.equal(catalogOffers(catalogs[1]!, "beta-only"), true);
  assert.equal(catalogOffers(catalogs[0]!, "beta-only"), false);
});

test("a model whose provider doesn't list its reasoning levels gets the chosen level, and none without a default", () => {
  const unknown: ProviderModelCatalog[] = [{ providerId: "acp", models: [{ model: "m", defaultReasoningEffort: "", reasoningDiscovery: "unknown", supportedReasoningEfforts: [] }] }];
  assert.equal(reviewExecution({ model: "acp/m", reasoningLevel: "high" }, unknown).execution.reasoningLevel, "high");
  const modelDefault = reviewExecution({ model: "acp/m", reasoningLevel: "default" }, unknown).execution;
  assert.equal("reasoningLevel" in modelDefault, false);
  assert.deepEqual(modelDefault.executionInputSources, { providerId: "explicit", model: "explicit" });
  const noDefault: ProviderModelCatalog[] = [{ providerId: "acp", models: [{ model: "m", defaultReasoningEffort: "", supportedReasoningEfforts: efforts("low") }] }];
  const unsupported = reviewExecution({ model: "m", reasoningLevel: "max" }, noDefault);
  assert.equal("reasoningLevel" in unsupported.execution, false);
  assert.match(unsupported.warning ?? "", /the review uses the project's level$/);
});

test("a blank model or one no available provider offers keeps the project's defaults", () => {
  assert.deepEqual(reviewExecution({ model: "  ", reasoningLevel: "medium" }, catalogs), { execution: {}, warning: null });
  const missing = reviewExecution({ model: "unknown-model", reasoningLevel: "medium" }, catalogs);
  assert.deepEqual(missing.execution, {});
  assert.match(missing.warning ?? "", /No available provider offers unknown-model/);
  assert.deepEqual(Object.keys(agentReviewSpawnArgs({ ...review, execution: missing.execution })).sort(), ["environment", "projectId", "prompt", "title"]);
});

test("off-type stored review settings fall back to their defaults; any provider's level is kept", () => {
  assert.deepEqual(readReviewSettings({ reviewModel: 5, reviewReasoningLevel: "" }), { reviewModel: "", reviewReasoningLevel: "default" });
  assert.deepEqual(readReviewSettings({ reviewModel: "beta/shared-model", reviewReasoningLevel: "ultra" }), { reviewModel: "beta/shared-model", reviewReasoningLevel: "ultra" });
  assert.deepEqual(readReviewSettings({ reviewModel: "legacy-model-id", reviewReasoningLevel: "medium" }), { reviewModel: "legacy-model-id", reviewReasoningLevel: "medium" });
});
