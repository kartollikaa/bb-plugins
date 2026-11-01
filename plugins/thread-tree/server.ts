// bb-plugin-subagent-tree backend: folds each thread's provider delegations
// (Claude Code `Agent` calls, Codex subagents) into a per-thread subagent list
// that the sidebar draws as a counter and a status dot.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { createSubagentFolder, subagentSchema } from "./src/subagents";

const MAX_THREADS_PER_CALL = 200;

export const rpcContract = defineRpcContract({
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

  bb.rpc.register(rpcContract, {
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
    name: "subagent-tree",
    summary: "List the provider subagents a thread has run",
    commands: [
      {
        name: "list",
        summary: "List a thread's subagents, newest first",
        usage: "bb subagent-tree list [thread-id] [--json]",
      },
    ],
    async run(argv, ctx) {
      const json = argv.includes("--json");
      const [command, threadArg] = argv.filter((arg) => arg !== "--json");
      if (command !== "list") {
        return {
          exitCode: command === undefined || command === "help" || command === "--help" ? 0 : 1,
          stdout: "Usage: bb subagent-tree list [thread-id] [--json]",
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
