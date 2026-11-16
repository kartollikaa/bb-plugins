import { test } from "node:test";
import assert from "node:assert/strict";
import { isExecutionRefusal, loadReviewCatalogs, spawnWithFallback, type ReviewCatalogSdk } from "../src/agentReview.ts";
import type { ProviderModelCatalog, ReviewExecution } from "../src/pullRequestActions.ts";

const opus = { model: "claude-opus-5-5", defaultReasoningEffort: "high", supportedReasoningEfforts: [{ reasoningEffort: "medium" }] };
const gpt = { model: "gpt-5.5", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "high" }] };

function fakeSdk({
  providers = [{ id: "codex", available: true }, { id: "claude-code", available: true }, { id: "off", available: false }],
  projectProviderId = null as string | null,
  catalogs = {} as Record<string, ProviderModelCatalog["models"] | { loadError: string } | Error>,
  defaultsError = null as Error | null,
} = {}) {
  const modelCalls: string[] = [];
  const sdk: ReviewCatalogSdk = {
    providers: {
      list: async () => providers,
      models: async ({ providerId, signal }) => {
        assert.ok(signal, "every catalog request carries a timeout signal");
        modelCalls.push(providerId);
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
  return { sdk, modelCalls };
}

const collect = () => {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
};

test("catalogs load one at a time and stop at the first provider offering the model", async () => {
  const { sdk, modelCalls } = fakeSdk({ catalogs: { codex: [gpt], "claude-code": [opus] } });
  const { lines, log } = collect();
  const catalogs = await loadReviewCatalogs(sdk, log, { projectId: "p", model: "gpt-5.5" });
  assert.deepEqual(modelCalls, ["codex"]);
  assert.deepEqual(catalogs.map((catalog) => catalog.providerId), ["codex"]);
  assert.deepEqual(lines, []);
});

test("the project's provider is asked first, and unavailable providers never", async () => {
  const { sdk, modelCalls } = fakeSdk({ projectProviderId: "claude-code", catalogs: { codex: [gpt], "claude-code": [opus] } });
  const catalogs = await loadReviewCatalogs(sdk, () => {}, { projectId: "p", model: "claude-opus-5-5" });
  assert.deepEqual(modelCalls, ["claude-code"]);
  assert.equal(catalogs[0]?.providerId, "claude-code");
});

test("a catalog with a load error is logged and skipped", async () => {
  const { sdk, modelCalls } = fakeSdk({ catalogs: { codex: { loadError: "timeout" }, "claude-code": [opus] } });
  const { lines, log } = collect();
  const catalogs = await loadReviewCatalogs(sdk, log, { projectId: "p", model: "claude-opus-5-5" });
  assert.deepEqual(modelCalls, ["codex", "claude-code"]);
  assert.deepEqual(catalogs.map((catalog) => catalog.providerId), ["claude-code"]);
  assert.deepEqual(lines, ["agent review: codex models unavailable: timeout"]);
});

test("a failed catalog request and a failed project-defaults read are both logged with their cause", async () => {
  const { sdk } = fakeSdk({ catalogs: { codex: new Error("HTTP 504: gateway"), "claude-code": [opus] }, defaultsError: new Error("HTTP 500: db") });
  const { lines, log } = collect();
  const catalogs = await loadReviewCatalogs(sdk, log, { projectId: "p", model: "claude-opus-5-5" });
  assert.deepEqual(catalogs.map((catalog) => catalog.providerId), ["claude-code"]);
  assert.deepEqual(lines, [
    "agent review: reading the project's default provider failed: HTTP 500: db",
    "agent review: listing codex models failed: HTTP 504: gateway",
  ]);
});

const chosen: ReviewExecution = {
  providerId: "claude-code",
  model: "claude-opus-5-5",
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
    "HTTP 400: Provider claude-code does not support turbo reasoning level. Supported reasoning levels: low, medium.",
    "HTTP 400: Opus 5.5 cannot run with the chosen options: fast. Sonnet 5.5 can.",
    'HTTP 400: Provider "claude-code" is disabled. Enable it in Settings → Providers.',
    'HTTP 400: Unknown provider "pool". Registered provider ids: codex.',
  ]) assert.equal(isExecutionRefusal(new Error(message)), true, message);
  for (const message of ["HTTP 504: gateway timeout", "Cannot connect to BB server.", 'HTTP 409: The default environment provider "x" is unavailable.']) {
    assert.equal(isExecutionRefusal(new Error(message)), false, message);
  }
});

test("a refused model retries once on the project's defaults and logs the real cause", async () => {
  const { calls, spawn } = fakeSpawn([new Error("HTTP 400: Provider claude-code does not support medium reasoning level. Supported reasoning levels: high.")]);
  const { lines, log } = collect();
  assert.deepEqual(await spawnWithFallback(spawn, chosen, log, "review"), { id: "thr_2" });
  assert.deepEqual(calls, [chosen, {}]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^review: bb refused claude-code\/claude-opus-5-5 at medium \(HTTP 400: Provider claude-code does not support medium/);
});

test("a refusal with no chosen execution is rethrown without a second spawn", async () => {
  const refusal = new Error('HTTP 400: Provider "codex" is disabled.');
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
