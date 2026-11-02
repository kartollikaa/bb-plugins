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
  githubFolderViewSchema,
  githubSettingsPatchSchema,
} from "./src/githubFolder";

const MAX_THREADS_PER_CALL = 200;

export const rpcContract = defineRpcContract({
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
    /** Null view when the GitHub Folder plugin is not installed, off or unreachable. */
    output: z.object({ view: githubFolderViewSchema.nullable() }),
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
  const folder = createSubagentFolder({
    listEvents: (args) => bb.sdk.threads.events.list(args),
    log: (message) => bb.log.warn(message),
  });

  type RpcInput = Parameters<typeof bb.sdk.plugins.callRpc>[0]["input"];
  const callGithubFolder = <T,>(method: string, input: RpcInput, outputSchema: z.ZodType<T>) =>
    bb.sdk.plugins.callRpc({ pluginId: GITHUB_FOLDER_PLUGIN_ID, method, input, outputSchema });
  const ok = z.object({ ok: z.literal(true) });

  bb.rpc.register(rpcContract, {
    githubFolder: async ({ refresh }) => {
      try {
        return { view: await callGithubFolder(refresh ? "refresh" : "folder", null, githubFolderViewSchema) };
      } catch {
        return { view: null };
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

  bb.events.on("thread.deleted", ({ thread }) => folder.forget(thread.id));

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
