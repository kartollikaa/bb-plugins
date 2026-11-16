// Server side of Agent review: which provider catalogs offer the review model, and the spawn fallback.
import { catalogOffers, parseReviewModel, reviewProviderOrder, type ProviderModelCatalog, type ReviewExecution } from "./pullRequestActions.ts";

export const CATALOG_TIMEOUT_MS = 5_000;

/** The slice of `bb.sdk` the catalog lookup uses, so tests can pass a fake. */
export interface ReviewCatalogSdk {
  providers: {
    list(): Promise<readonly { id: string; available: boolean }[]>;
    models(args: { projectId?: string; providerId: string; signal?: AbortSignal }): Promise<{
      modelLoadError: { code: string } | null;
      models: ProviderModelCatalog["models"];
    }>;
  };
  projects: {
    defaultExecutionOptions(args: { projectId: string }): Promise<{ providerId: string } | null>;
  };
}

export type ReviewLog = (message: string) => void;

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Stops at the first provider offering the saved model: the pinned provider only, or for a bare model id the
 * project's provider first. A catalog that fails, times out or reports a load error is logged and skipped.
 */
export async function loadReviewCatalogs(
  sdk: ReviewCatalogSdk,
  log: ReviewLog,
  { projectId, model, timeoutMs = CATALOG_TIMEOUT_MS }: { projectId?: string; model: string; timeoutMs?: number },
): Promise<ProviderModelCatalog[]> {
  const ref = parseReviewModel(model);
  if (!ref) return [];
  const [providers, projectDefaults] = await Promise.all([
    sdk.providers.list().catch((error) => {
      log(`agent review: listing providers failed: ${errorMessage(error)}`);
      return [];
    }),
    projectId && ref.providerId === null
      ? sdk.projects.defaultExecutionOptions({ projectId }).catch((error) => {
          log(`agent review: reading the project's default provider failed: ${errorMessage(error)}`);
          return null;
        })
      : null,
  ]);
  const available = providers.filter((provider) => provider.available).map((provider) => provider.id);
  if (ref.providerId !== null && !available.includes(ref.providerId)) log(`agent review: provider ${ref.providerId} isn't available`);
  const order = ref.providerId !== null
    ? available.filter((id) => id === ref.providerId)
    : reviewProviderOrder(available, projectDefaults?.providerId ?? null);
  const catalogs: ProviderModelCatalog[] = [];
  for (const providerId of order) {
    try {
      const result = await sdk.providers.models({ ...(projectId ? { projectId } : {}), providerId, signal: AbortSignal.timeout(timeoutMs) });
      if (result.modelLoadError) {
        log(`agent review: ${providerId} models unavailable: ${result.modelLoadError.code}`);
        continue;
      }
      const catalog = { providerId, models: result.models };
      catalogs.push(catalog);
      if (catalogOffers(catalog, ref.model)) break;
    } catch (error) {
      log(`agent review: listing ${providerId} models failed: ${errorMessage(error)}`);
    }
  }
  return catalogs;
}

export interface ReviewPickerValue {
  providerId: string;
  model: string;
  reasoningLevel: string;
}

/**
 * Where the settings picker opens: the saved model on the provider that offers it, else the first available
 * provider's default model. The picker needs a concrete provider and model even while the setting is blank.
 */
export async function reviewPickerSeed(sdk: ReviewCatalogSdk, log: ReviewLog, savedModel: string): Promise<ReviewPickerValue | null> {
  const ref = parseReviewModel(savedModel);
  if (ref) {
    for (const catalog of await loadReviewCatalogs(sdk, log, { model: savedModel })) {
      const entry = catalog.models.find((candidate) => candidate.model === ref.model);
      if (entry) return { providerId: catalog.providerId, model: entry.model, reasoningLevel: entry.defaultReasoningEffort };
    }
  }
  const providers = await sdk.providers.list().catch(() => []);
  for (const provider of providers.filter((candidate) => candidate.available)) {
    const result = await sdk.providers.models({ providerId: provider.id, signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) }).catch(() => null);
    const entry = result && !result.modelLoadError ? (result.models.find((candidate) => candidate.isDefault) ?? result.models[0]) : undefined;
    if (entry) return { providerId: provider.id, model: entry.model, reasoningLevel: entry.defaultReasoningEffort };
  }
  return null;
}

/**
 * bb's refusals of a chosen provider, model or reasoning level at thread creation. bb rejects these before
 * it inserts the thread, so a retry can't leave a second one.
 */
const EXECUTION_REFUSALS = [
  /does not support \S+ reasoning level/,
  /cannot run with the chosen options/,
  /Provider "[^"]+" is disabled/,
  /Unknown provider "[^"]+"/,
];

export function isExecutionRefusal(error: unknown): boolean {
  const message = errorMessage(error);
  return EXECUTION_REFUSALS.some((pattern) => pattern.test(message));
}

/** Retries on the project's defaults only when bb refused the chosen execution; any other failure is rethrown untouched. */
export async function spawnWithFallback<T>(
  spawn: (execution: ReviewExecution) => Promise<T>,
  execution: ReviewExecution,
  log: ReviewLog,
  label: string,
): Promise<T> {
  try {
    return await spawn(execution);
  } catch (error) {
    if (Object.keys(execution).length === 0 || !isExecutionRefusal(error)) throw error;
    log(`${label}: bb refused ${execution.providerId}/${execution.model}${execution.reasoningLevel ? ` at ${execution.reasoningLevel}` : ""} (${errorMessage(error)}); retrying on the project's default model`);
    return spawn({});
  }
}
