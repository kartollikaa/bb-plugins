import { test } from "node:test";
import assert from "node:assert/strict";
import { isExecutionRefusal, loadReviewCatalogs, reviewPickerSeed, spawnWithFallback, type ReviewCatalogSdk } from "../src/agentReview.ts";
import type { ProviderModelCatalog, ReviewExecution } from "../src/pullRequestActions.ts";

const shared = { model: "shared-model", defaultReasoningEffort: "high", supportedReasoningEfforts: [{ reasoningEffort: "medium" }] };
const alphaOnly = { model: "alpha-only", isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "high" }] };
const betaOnly = { model: "beta-only", defaultReasoningEffort: "low", supportedReasoningEfforts: [{ reasoningEffort: "low" }] };

function fakeSdk({
  providers = [{ id: "alpha", available: true }, { id: "beta", available: true }, { id: "off", available: false }],
  projectProviderId = null as string | null,
  catalogs = {} as Record<string, ProviderModelCatalog["models"] | { loadError: string } | Error>,
  defaultsError = null as Error | null,
} = {}) {
  const modelCalls: string[] = [];
  const projectCalls: (string | undefined)[] = [];
  const sdk: ReviewCatalogSdk = {
    providers: {
      list: async () => providers,
      models: async ({ projectId, providerId, signal }) => {
        assert.ok(signal, "every catalog request carries a timeout signal");
        modelCalls.push(providerId);
        projectCalls.push(projectId);
        const entry = catalogs[providerId];
        if (entry instanceof Error) throw entry;
        if (entry && "loadError" in entry) return { modelLoadError: { code: entry.loadError }, models: [] };
        return { modelLoadError: null, models: entry ?? [] };
      },
    },
    projects: {
      defaultExecutionOptions: async () => {
        if (defaultsError) throw defaultsError;
        return projectProviderId ? { providerId: projectProviderId } : null;
      },
    },
  };
  return { sdk, modelCalls, projectCalls };
}

const collect = () => {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
};

test("a blank model loads no catalog at all", async () => {
  const { sdk, modelCalls } = fakeSdk({ catalogs: { alpha: [shared] } });
  assert.deepEqual(await loadReviewCatalogs(sdk, () => {}, { projectId: "p", model: "" }), []);
  assert.deepEqual(modelCalls, []);
});

test("a bare model id loads catalogs one at a time and stops at the first provider offering it", async () => {
  const { sdk, modelCalls } = fakeSdk({ catalogs: { alpha: [shared], beta: [shared] } });
  const { lines, log } = collect();
  const catalogs = await loadReviewCatalogs(sdk, log, { projectId: "p", model: "shared-model" });
  assert.deepEqual(modelCalls, ["alpha"]);
  assert.deepEqual(catalogs.map((catalog) => catalog.providerId), ["alpha"]);
  assert.deepEqual(lines, []);
});

test("a model only the second provider offers is found there", async () => {
  const { sdk, modelCalls } = fakeSdk({ catalogs: { alpha: [shared], beta: [betaOnly] } });
  const catalogs = await loadReviewCatalogs(sdk, () => {}, { projectId: "p", model: "beta-only" });
  assert.deepEqual(modelCalls, ["alpha", "beta"]);
  assert.deepEqual(catalogs.map((catalog) => catalog.providerId), ["alpha", "beta"]);
});

test("a pinned pair asks only its provider, and never another that offers the same model", async () => {
  const { sdk, modelCalls } = fakeSdk({ catalogs: { alpha: [shared], beta: [shared] } });
  const catalogs = await loadReviewCatalogs(sdk, () => {}, { projectId: "p", model: "beta/shared-model" });
  assert.deepEqual(modelCalls, ["beta"]);
  assert.deepEqual(catalogs.map((catalog) => catalog.providerId), ["beta"]);
});

test("a pinned provider that isn't available is logged and asked nothing", async () => {
  const { sdk, modelCalls } = fakeSdk({ catalogs: { alpha: [shared] } });
  const { lines, log } = collect();
  assert.deepEqual(await loadReviewCatalogs(sdk, log, { projectId: "p", model: "off/shared-model" }), []);
  assert.deepEqual(modelCalls, []);
  assert.deepEqual(lines, ["agent review: provider off isn't available"]);
});

test("for a bare id the project's provider is asked first, and unavailable providers never", async () => {
  const { sdk, modelCalls } = fakeSdk({ projectProviderId: "beta", catalogs: { alpha: [shared], beta: [shared] } });
  const catalogs = await loadReviewCatalogs(sdk, () => {}, { projectId: "p", model: "shared-model" });
  assert.deepEqual(modelCalls, ["beta"]);
  assert.equal(catalogs[0]?.providerId, "beta");
});

test("a catalog with a load error is logged and skipped", async () => {
  const { sdk, modelCalls } = fakeSdk({ catalogs: { alpha: { loadError: "timeout" }, beta: [shared] } });
  const { lines, log } = collect();
  const catalogs = await loadReviewCatalogs(sdk, log, { projectId: "p", model: "shared-model" });
  assert.deepEqual(modelCalls, ["alpha", "beta"]);
  assert.deepEqual(catalogs.map((catalog) => catalog.providerId), ["beta"]);
  assert.deepEqual(lines, ["agent review: alpha models unavailable: timeout"]);
});

test("a failed catalog request and a failed project-defaults read are both logged with their cause", async () => {
  const { sdk } = fakeSdk({ catalogs: { alpha: new Error("HTTP 504: gateway"), beta: [shared] }, defaultsError: new Error("HTTP 500: db") });
  const { lines, log } = collect();
  const catalogs = await loadReviewCatalogs(sdk, log, { projectId: "p", model: "shared-model" });
  assert.deepEqual(catalogs.map((catalog) => catalog.providerId), ["beta"]);
  assert.deepEqual(lines, [
    "agent review: reading the project's default provider failed: HTTP 500: db",
    "agent review: listing alpha models failed: HTTP 504: gateway",
  ]);
});

test("the settings picker opens on the saved model's provider, or the first provider's default model", async () => {
  const { sdk, projectCalls } = fakeSdk({ catalogs: { alpha: [shared, alphaOnly], beta: [betaOnly] } });
  assert.deepEqual(await reviewPickerSeed(sdk, () => {}, "beta-only"), { providerId: "beta", model: "beta-only", reasoningLevel: "low" });
  assert.deepEqual(await reviewPickerSeed(sdk, () => {}, "beta/beta-only"), { providerId: "beta", model: "beta-only", reasoningLevel: "low" });
  assert.deepEqual(await reviewPickerSeed(sdk, () => {}, ""), { providerId: "alpha", model: "alpha-only", reasoningLevel: "medium" });
  assert.deepEqual(await reviewPickerSeed(sdk, () => {}, "gone-model"), { providerId: "alpha", model: "alpha-only", reasoningLevel: "medium" });
  assert.ok(projectCalls.every((projectId) => projectId === undefined), "the picker lists the server machine's catalogs");
});

test("the picker has nothing to open on when no provider lists a model", async () => {
  const { sdk } = fakeSdk({ catalogs: { alpha: { loadError: "auth_required" }, beta: [] } });
  assert.equal(await reviewPickerSeed(sdk, () => {}, ""), null);
});

const chosen: ReviewExecution = {
  providerId: "beta",
  model: "shared-model",
  reasoningLevel: "medium",
  executionInputSources: { providerId: "explicit", model: "explicit", reasoningLevel: "explicit" },
};

function fakeSpawn(failures: Error[]) {
  const calls: ReviewExecution[] = [];
  const spawn = async (execution: ReviewExecution) => {
    calls.push(execution);
    const failure = failures.shift();
    if (failure) throw failure;
    return { id: `thr_${calls.length}` };
  };
  return { calls, spawn };
}

test("bb's real refusals of a model, provider or reasoning level are recognised; other failures are not", () => {
  for (const message of [
    "HTTP 400: Provider beta does not support turbo reasoning level. Supported reasoning levels: low, medium.",
    "HTTP 400: Shared Model cannot run with the chosen options: fast. Other Model can.",
    'HTTP 400: Provider "beta" is disabled. Enable it in Settings → Providers.',
    'HTTP 400: Unknown provider "pool". Registered provider ids: alpha.',
  ]) assert.equal(isExecutionRefusal(new Error(message)), true, message);
  for (const message of ["HTTP 504: gateway timeout", "Cannot connect to BB server.", 'HTTP 409: The default environment provider "x" is unavailable.']) {
    assert.equal(isExecutionRefusal(new Error(message)), false, message);
  }
});

test("a refused model retries once on the project's defaults and logs the real cause", async () => {
  const { calls, spawn } = fakeSpawn([new Error("HTTP 400: Provider beta does not support medium reasoning level. Supported reasoning levels: high.")]);
  const { lines, log } = collect();
  assert.deepEqual(await spawnWithFallback(spawn, chosen, log, "review"), { id: "thr_2" });
  assert.deepEqual(calls, [chosen, {}]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^review: bb refused beta\/shared-model at medium \(HTTP 400: Provider beta does not support medium/);
});

test("a refusal with no chosen execution is rethrown without a second spawn", async () => {
  const refusal = new Error('HTTP 400: Provider "alpha" is disabled.');
  const { calls, spawn } = fakeSpawn([refusal]);
  const { lines, log } = collect();
  await assert.rejects(spawnWithFallback(spawn, {}, log, "review"), refusal);
  assert.deepEqual(calls, [{}]);
  assert.deepEqual(lines, []);
});

test("a failure that isn't about the model is rethrown without a second spawn", async () => {
  const outage = new Error("HTTP 504: gateway timeout");
  const { calls, spawn } = fakeSpawn([outage]);
  const { lines, log } = collect();
  await assert.rejects(spawnWithFallback(spawn, chosen, log, "review"), outage);
  assert.deepEqual(calls, [chosen]);
  assert.deepEqual(lines, []);
});

test("an accepted spawn is not retried", async () => {
  const { calls, spawn } = fakeSpawn([]);
  assert.deepEqual(await spawnWithFallback(spawn, chosen, () => {}, "review"), { id: "thr_1" });
  assert.deepEqual(calls, [chosen]);
});
