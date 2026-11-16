// bb-plugin-thread-tree backend: per-thread subagent lists, plus the automations
// summary and the GitHub folder read from the plugins that own them.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { createSubagentFolder, subagentSchema } from "./src/subagents";
import {
  AUTOMATION_ACTION_METHOD,
  AUTOMATIONS_PLUGIN_ID,
  automationSummarySchema,
  overviewSchema,
  summarizeOverview,
} from "./src/automations";
import {
  GITHUB_FOLDER_PLUGIN_ID,
  githubFolderAbsent,
  githubFolderViewSchema,
  githubSettingsPatchSchema,
} from "./src/githubFolder";
import { readReviewSettings, REVIEW_SETTINGS, sectionPatchSchema, SETTINGS } from "./src/settings";
import { createThreadPullRequestReader, threadPullRequestSchema } from "./src/threadPullRequests";
import { createProjectFolderHistory, lineageProjectIds } from "./src/projectFolders";
import { ARCHIVE_CLAIM_TTL_MS, createArchiveClaims, createArchiveHistory, releaseUnarchived } from "./src/archiveUndo";
import { archiveScopes, dirtyEnvironmentIds, MAX_THREADS_PER_CALL } from "./src/orchestrations";
import { createSignalReader, threadSignalsSchema, type SignalListArgs } from "./src/threadSignals";
import {
  agentReviewSpawnArgs,
  encodeReviewModel,
  mergeEnvironmentOf,
  projectForRepo,
  PR_STATUS_PLUGIN_ID,
  repoSlugFromPrUrl,
  reviewExecution,
} from "./src/pullRequestActions";
import { loadReviewCatalogs, reviewPickerSeed, spawnWithFallback } from "./src/agentReview";
import { pullRequestStatusRowSchema } from "./src/threadPullRequests";

/** At most one refresh per thread this often; bb already debounces its events to one a second. */
const SIGNAL_REFRESH_MS = 2_000;
const signalTag = (threadId: string) => `signals:${threadId}`;


const reviewPickerValueSchema = z.object({
  providerId: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  reasoningLevel: z.string().min(1).max(50),
}).strict();

const pullRequestUrlSchema = z.string().max(400).regex(/^https:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/i);

export const rpcContract = defineRpcContract({
  /** The project an agent review of a repo's PR starts in, keyed by `owner/repo`; null when no project has that remote. */
  reviewProjects: {
    input: z.object({ keys: z.array(z.string().min(1).max(200)).min(1).max(200) }),
    output: z.record(z.string(), z.object({ projectId: z.string(), name: z.string() }).nullable()),
  },
  /** Where the Agent review picker on the settings page opens; null when no provider lists a model. */
  reviewPickerSeed: {
    input: z.null(),
    output: reviewPickerValueSchema.nullable(),
  },
  /** Saves the Agent review model; null goes back to the project's default model and reasoning. */
  setReviewModel: {
    input: z.object({ selection: reviewPickerValueSchema.nullable() }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
  agentReview: {
    input: z.object({ url: pullRequestUrlSchema, number: z.number().int().positive(), title: z.string().max(400) }).strict(),
    output: z.object({ threadId: z.string(), projectId: z.string() }),
  },
  /** Merges a PR through bb's GitHub PR Status, only while it is still that environment's open current-branch PR. */
  mergePullRequest: {
    input: z.object({ environmentId: z.string().min(1), url: pullRequestUrlSchema }).strict(),
    output: z.object({ message: z.string() }),
  },
  threadPullRequests: {
    input: z.object({ keys: z.array(z.string().min(1)).min(1).max(200) }),
    output: z.record(z.string(), z.array(threadPullRequestSchema)),
  },
  projectFolders: { input: z.null(), output: z.object({ projectIds: z.array(z.string()), lastActivityAt: z.record(z.string(), z.number()) }) },
  /** Each thread's current turn as its event log tells it; null when the log couldn't be read. */
  threadSignals: {
    input: z.object({ keys: z.array(z.string().min(1)).min(1).max(200) }),
    output: z.record(z.string(), threadSignalsSchema.nullable()),
    keyTags: (key: string) => [signalTag(key)],
  },
  automations: {
    input: z.null(),
    output: z.object({
      /** False when bb's Automations plugin is off or unreachable. */
      available: z.boolean(),
      automations: z.array(automationSummarySchema),
    }),
  },
  automationAction: {
    input: z.object({
      projectId: z.string().trim().min(1),
      automationId: z.string().trim().min(1),
      action: z.enum(["run", "pause", "resume"]),
    }),
    output: z.object({ ok: z.literal(true) }),
  },
  githubFolder: {
    input: z.object({ refresh: z.boolean() }),
    /** Null view when the GitHub Folder plugin is not installed; `failed` when a read failed and the view is unknown. */
    output: z.object({ view: githubFolderViewSchema.nullable(), failed: z.literal(true).optional() }),
  },
  githubFolderUpdate: {
    input: githubSettingsPatchSchema,
    output: z.object({ ok: z.literal(true) }),
  },
  /** Warms the GitHub Folder plugin's PR cache before its page opens. */
  githubFolderPrefetch: {
    input: z.object({ url: z.string().min(1).max(400) }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
  githubFolderSnooze: {
    input: z.object({ key: z.string().min(1).max(400), snoozed: z.boolean() }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
  /** Brings back the most recent archive action's threads; empty when there is nothing to undo. */
  undoArchive: {
    input: z.null(),
    output: z.object({
      restored: z.array(z.object({ threadId: z.string(), title: z.string() })),
      failed: z.array(z.object({ threadId: z.string(), title: z.string(), error: z.string() })),
    }),
  },
  /** What archiving each thread takes along (itself, its cascade, hidden descendants), and which of those have a dirty worktree. */
  archiveScope: {
    input: z.object({ threadIds: z.array(z.string().min(1)).min(1).max(MAX_THREADS_PER_CALL) }).strict(),
    output: z.object({ scopes: z.record(z.string(), z.array(z.string())), dirty: z.array(z.string()) }),
  },
  /** Groups the coming archives of these threads into one ⌘Z, however far apart they land. */
  archiveClaim: {
    input: z.object({ threadIds: z.array(z.string().min(1)).min(1) }).strict(),
    output: z.object({ claimId: z.string() }),
  },
  /** Ends a claim; threads it covered that weren't archived go back to ordinary grouping. */
  archiveRelease: {
    input: z.object({ claimId: z.string().min(1) }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
  /** Shows or hides sidebar sections from the sidebar itself. */
  setSections: {
    input: sectionPatchSchema,
    output: z.object({ ok: z.literal(true) }),
  },
  subagents: {
    input: z.object({
      threadIds: z.array(z.string().trim().min(1)).max(MAX_THREADS_PER_CALL),
    }),
    output: z.object({
      threads: z.array(
        z.object({
          threadId: z.string(),
          total: z.number(),
          subagents: z.array(subagentSchema),
        }),
      ),
    }),
  },
});

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({ ...SETTINGS, ...REVIEW_SETTINGS });
  const folder = createSubagentFolder({
    listEvents: (args) => bb.sdk.threads.events.list(args),
    log: (message) => bb.log.warn(message),
  });

  type RpcInput = Parameters<typeof bb.sdk.plugins.callRpc>[0]["input"];
  const callGithubFolder = <T,>(method: string, input: RpcInput, outputSchema: z.ZodType<T>) =>
    bb.sdk.plugins.callRpc({ pluginId: GITHUB_FOLDER_PLUGIN_ID, method, input, outputSchema });
  const ok = z.object({ ok: z.literal(true) });

  const archives = createArchiveHistory();
  const claims = createArchiveClaims({ claim: archives.claim, ttlMs: ARCHIVE_CLAIM_TTL_MS });
  const projectFolders = createProjectFolderHistory(bb.storage.kv, async (args) => ({ threads: await bb.sdk.threads.list(args) }));
  for (const event of ["thread.created", "thread.archived", "thread.unarchived", "thread.deleted"] as const) {
    bb.events.on(event, ({ thread }) => projectFolders.record(thread));
  }
  const parentCache = new Map<string, { id: string; parentThreadId: string | null; projectId: string; visibility: string }>();
  const threadLineageProjectIds = async (thread: { id: string; parentThreadId: string | null; projectId: string; visibility: string }) => {
    const ancestors = new Map<string, typeof thread>();
    for (let parentId = thread.parentThreadId; parentId && !ancestors.has(parentId) && ancestors.size < 32; ) {
      const parent = parentCache.get(parentId) ?? await bb.sdk.threads.get({ threadId: parentId }).catch(() => null);
      if (!parent) break;
      parentCache.set(parent.id, parent);
      ancestors.set(parent.id, parent);
      parentId = parent.parentThreadId;
    }
    return lineageProjectIds(thread, (id) => ancestors.get(id));
  };
  for (const event of ["thread.active", "thread.idle", "thread.failed"] as const) {
    bb.events.on(event, ({ thread }) => {
      if (thread.visibility === "hidden") return;
      const at = Date.now();
      void threadLineageProjectIds(thread).then((projectIds) => projectFolders.recordActivity(projectIds, at)).catch((error) => bb.log.warn(`project activity: ${error}`));
    });
  }

  const signals = createSignalReader({
    listEvents: (args: SignalListArgs) => bb.sdk.threads.events.list(args as Parameters<typeof bb.sdk.threads.events.list>[0]),
    log: (message) => bb.log.warn(message),
  });
  const signalRefresh = new Map<string, ReturnType<typeof setTimeout>>();
  const refreshSignals = (threadId: string) => {
    if (!signals.has(threadId) || signalRefresh.has(threadId)) return;
    signalRefresh.set(threadId, setTimeout(() => {
      signalRefresh.delete(threadId);
      bb.rpc.experimental_invalidate([signalTag(threadId)]);
    }, SIGNAL_REFRESH_MS));
  };
  for (const event of ["experimental_thread.events", "thread.active", "thread.idle", "thread.failed"] as const) {
    bb.events.on(event, ({ thread }) => refreshSignals(thread.id));
  }

  const readSessionPullRequests = createThreadPullRequestReader((method, input, outputSchema) =>
    bb.sdk.plugins.callRpc({ pluginId: "thread-links", method, input, outputSchema }));

  const inChunks = async <T,>(ids: readonly string[], read: (chunk: string[]) => Promise<T[]>) => {
    const out: T[] = [];
    for (let index = 0; index < ids.length; index += MAX_THREADS_PER_CALL) out.push(...await read(ids.slice(index, index + MAX_THREADS_PER_CALL)));
    return out;
  };
  const readDirtyEnvironments = async (environmentIds: string[]) => {
    try {
      const statuses = await bb.sdk.plugins.callRpc({ pluginId: "bb--git", method: "status", input: { keys: environmentIds }, outputSchema: z.record(z.string(), z.unknown()) });
      return dirtyEnvironmentIds(environmentIds, statuses);
    } catch (error) {
      bb.log.warn(`git status for archive failed: ${error instanceof Error ? error.message : String(error)}`);
      return environmentIds;
    }
  };
  const dirtyThreadIds = async (threadIds: string[]) => {
    if (threadIds.length === 0) return [];
    const threads = await inChunks(threadIds, (chunk) => bb.sdk.threads.list({ threadIds: chunk, includeHidden: true, archived: false }));
    const environmentIds = [...new Set(threads.flatMap((thread) => thread.environmentId ? [thread.environmentId] : []))];
    const worktrees = (await Promise.all(environmentIds.map(async (environmentId) => {
      const environment = await bb.sdk.environments.get({ environmentId }).catch(() => null);
      return environment?.isWorktree === false ? [] : [environmentId];
    }))).flat();
    const dirty = new Set(await inChunks(worktrees, readDirtyEnvironments));
    return threads.filter((thread) => thread.environmentId && dirty.has(thread.environmentId)).map((thread) => thread.id);
  };

  const listProjects = async () => (await bb.sdk.projects.list()).map((project) => ({
    id: project.id,
    name: project.name,
    gitRemoteUrl: project.gitRemoteUrl,
    updatedAt: project.updatedAt,
  }));

  const warn = (message: string) => bb.log.warn(message);

  bb.rpc.register(rpcContract, {
    reviewProjects: async ({ keys }) => {
      const projects = await listProjects();
      return Object.fromEntries(keys.map((repo) => [repo, projectForRepo(repo, projects)]));
    },
    reviewPickerSeed: async () => reviewPickerSeed(bb.sdk, warn, readReviewSettings(await settings.get()).reviewModel),
    setReviewModel: async ({ selection }) => {
      await settings.experimental_set(selection
        ? { reviewModel: encodeReviewModel(selection), reviewReasoningLevel: selection.reasoningLevel }
        : { reviewModel: null, reviewReasoningLevel: null });
      return { ok: true as const };
    },
    agentReview: async ({ url, number, title }) => {
      const repo = repoSlugFromPrUrl(url);
      const project = repo ? projectForRepo(repo, await listProjects()) : null;
      if (!project) throw new Error(`No project uses ${repo ?? url}`);
      const { reviewModel, reviewReasoningLevel } = readReviewSettings(await settings.get());
      const { execution, warning } = reviewExecution(
        { model: reviewModel, reasoningLevel: reviewReasoningLevel },
        await loadReviewCatalogs(bb.sdk, warn, { projectId: project.projectId, model: reviewModel }),
      );
      if (warning) warn(`agent review of ${url}: ${warning}`);
      const thread = await spawnWithFallback(
        (chosen) => bb.sdk.threads.spawn(agentReviewSpawnArgs({ projectId: project.projectId, url, number, title, execution: chosen })),
        execution,
        warn,
        `agent review of ${url}`,
      );
      return { threadId: thread.id, projectId: project.projectId };
    },
    mergePullRequest: async ({ environmentId, url }) => {
      const rows = await bb.sdk.plugins.callRpc({
        pluginId: PR_STATUS_PLUGIN_ID,
        method: "pullRequests",
        input: { keys: [environmentId] },
        outputSchema: z.record(z.string(), pullRequestStatusRowSchema),
      });
      if (mergeEnvironmentOf(url, rows) !== environmentId) throw new Error("This pull request is no longer open on that thread's branch");
      return bb.sdk.plugins.callRpc({
        pluginId: PR_STATUS_PLUGIN_ID,
        method: "merge",
        input: { environmentId, method: "merge" },
        outputSchema: z.object({ message: z.string() }),
      });
    },
    threadPullRequests: async ({ keys }) => Object.fromEntries(await Promise.all(keys.map(async (threadId) =>
      [threadId, await readSessionPullRequests(threadId)],
    ))),
    projectFolders: () => projectFolders.list(),
    threadSignals: async ({ keys }) => Object.fromEntries(await Promise.all([...new Set(keys)].map(async (threadId) =>
      [threadId, await signals.read(threadId).catch(() => null)] as const,
    ))),
    undoArchive: async () => {
      const batch = archives.takeLatestBatch();
      const restored: { threadId: string; title: string }[] = [];
      const failed: { threadId: string; title: string; error: string }[] = [];
      for (const thread of batch?.threads ?? []) {
        try {
          await bb.sdk.threads.unarchive({ threadId: thread.threadId });
          restored.push(thread);
        } catch (error) {
          failed.push({ ...thread, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return { restored, failed };
    },
    archiveScope: async ({ threadIds }) => {
      const [cascade, descendants] = await Promise.all([
        bb.sdk.threads.experimental_listCascade({ threadIds, action: "archive" }),
        bb.sdk.threads.experimental_listDescendants({ threadIds, includeHidden: true }),
      ]);
      const scopes = archiveScopes(threadIds, cascade.threads, descendants.threads);
      return { scopes, dirty: await dirtyThreadIds([...new Set(Object.values(scopes).flat())]) };
    },
    archiveClaim: async ({ threadIds }) => ({ claimId: claims.open(threadIds) }),
    archiveRelease: async ({ claimId }) => {
      const claim = claims.take(claimId);
      if (claim) {
        await releaseUnarchived(claim, async (threadIds) =>
          (await inChunks([...threadIds], (chunk) => bb.sdk.threads.list({ threadIds: chunk, includeHidden: true, archived: true }))).map((thread) => thread.id),
        );
      }
      return { ok: true as const };
    },
    setSections: async (patch) => {
      await settings.experimental_set(patch);
      return { ok: true as const };
    },
    githubFolder: async ({ refresh }) => {
      try {
        return { view: await callGithubFolder(refresh ? "refresh" : "folder", null, githubFolderViewSchema) };
      } catch (error) {
        return githubFolderAbsent(error) ? { view: null } : { view: null, failed: true as const };
      }
    },
    githubFolderUpdate: (patch) => callGithubFolder("updateSettings", patch, ok),
    githubFolderSnooze: (input) => callGithubFolder("snooze", input, ok),
    githubFolderPrefetch: async (input) => {
      await callGithubFolder("prContext", input, z.object({ context: z.string() })).catch(() => undefined);
      return { ok: true as const };
    },
    automations: async () => {
      try {
        const overview = await bb.sdk.plugins.callRpc({
          pluginId: AUTOMATIONS_PLUGIN_ID,
          method: "automations_overview",
          input: null,
          outputSchema: overviewSchema,
        });
        return { available: true, automations: summarizeOverview(overview) };
      } catch (error) {
        bb.log.warn(`automations overview failed: ${error instanceof Error ? error.message : String(error)}`);
        return { available: false, automations: [] };
      }
    },
    automationAction: async ({ projectId, automationId, action }) => {
      await bb.sdk.plugins.callRpc({
        pluginId: AUTOMATIONS_PLUGIN_ID,
        method: AUTOMATION_ACTION_METHOD[action],
        input: { projectId, automationId },
        outputSchema: z.unknown(),
      });
      return { ok: true as const };
    },
    subagents: async ({ threadIds }) => ({
      threads: await Promise.all(
        [...new Set(threadIds)].map(async (threadId) => ({
          threadId,
          ...(await folder.read(threadId)),
        })),
      ),
    }),
  });

  bb.events.on("thread.deleted", ({ thread }) => {
    folder.forget(thread.id);
    archives.forget(thread.id);
    signals.forget(thread.id);
  });
  bb.events.on("thread.archived", ({ thread }) => archives.record(thread.id, thread.title ?? thread.titleFallback ?? "Untitled thread"));
  bb.events.on("thread.unarchived", ({ thread }) => archives.forget(thread.id));

  bb.cli.register({
    name: "thread-tree",
    summary: "List the provider subagents a thread has run",
    commands: [
      {
        name: "list",
        summary: "List a thread's subagents, newest first",
        usage: "bb thread-tree list [thread-id] [--json]",
      },
    ],
    async run(argv, ctx) {
      const json = argv.includes("--json");
      const [command, threadArg] = argv.filter((arg) => arg !== "--json");
      if (command !== "list") {
        return {
          exitCode: command === undefined || command === "help" || command === "--help" ? 0 : 1,
          stdout: "Usage: bb thread-tree list [thread-id] [--json]",
        };
      }
      const threadId = threadArg ?? ctx.threadId;
      if (!threadId) {
        return { exitCode: 1, stderr: "Pass a thread id, or run this from inside a thread." };
      }
      const { total, subagents } = await folder.read(threadId);
      if (json) return { exitCode: 0, stdout: JSON.stringify({ threadId, total, subagents }) };
      if (total === 0) return { exitCode: 0, stdout: `No subagents in ${threadId}.` };
      const lines = subagents.map((agent) =>
        [agent.state.padEnd(9), agent.background ? "bg" : "fg", agent.agentType ?? "-", agent.label].join("  "),
      );
      const hidden = total - subagents.length;
      if (hidden > 0) lines.push(`… ${hidden} older not shown`);
      return { exitCode: 0, stdout: lines.join("\n") };
    },
  });
}
