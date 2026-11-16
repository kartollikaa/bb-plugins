import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract, querySchema } from "./lib/contract.ts";
import { foldRuns, type EventRow, type Run } from "./lib/metrics.ts";
const TYPES = [
  "item/started",
  "item/completed",
  "item/delegation/progress",
  "item/delegation/completed",
  "item/backgroundTask/progress",
  "item/backgroundTask/completed",
] as const;
export default function plugin(bb: BbPluginApi) {
  let pending: Promise<unknown> = Promise.resolve();
  async function scan(
    input: ReturnType<typeof querySchema.parse>,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const threads = await bb.sdk.threads.list({
      projectId: input.projectId ?? undefined,
      threadIds: input.threadId ? [input.threadId] : undefined,
      includeHidden: true,
      archived: input.archived,
      limit: 100,
      signal,
    });
    let partial = threads.length === 100;
    let failedThreads = 0;
    const runs: Run[] = [];
    let scannedThreads = 0;
    for (const thread of threads) {
      signal?.throwIfAborted();
      scannedThreads++;
      try {
        const rows: EventRow[] = [];
        let beforeSeq: string | undefined;
        for (let page = 0; page < 20; page++) {
          const next = await bb.sdk.threads.events.list({
            threadId: thread.id,
            types: TYPES,
            order: "desc",
            beforeSeq,
            limit: "100",
            signal,
          });
          rows.push(...next);
          if (next.length < 100) break;
          beforeSeq = String(next[next.length - 1].seq);
          if (page === 19) partial = true;
        }
        runs.push(...foldRuns(rows, thread));
      } catch {
        signal?.throwIfAborted();
        failedThreads++;
      }
      if (runs.length >= 5000) {
        runs.length = 5000;
        partial = true;
        break;
      }
    }
    return {
      runs,
      scannedThreads,
      partial,
      failedThreads,
      scannedAt: Date.now(),
    };
  }
  async function serializedScan(
    input: ReturnType<typeof querySchema.parse>,
    signal?: AbortSignal,
  ) {
    const result = pending.then(() => scan(input, signal));
    pending = result.catch(() => undefined);
    return result;
  }
  bb.rpc.register(rpcContract, {
    scan: (input, context) =>
      serializedScan(input, context.experimental_signal),
    projects: async () =>
      (await bb.sdk.projects.list({ includePersonal: true })).map((p) => ({
        id: p.id,
        name: p.name,
      })),
  });
  bb.cli.register({
    name: "team-stats",
    summary: "Inspect per-member agent usage and timing",
    commands: [
      {
        name: "list",
        summary: "List observed runs",
        usage:
          "bb team-stats list [--project <id>] [--thread <id>] [--archived] [--json]",
      },
    ],
    async run(argv) {
      const args = [...argv];
      if (args.shift() !== "list")
        return {
          exitCode: 1,
          stderr:
            "Usage: bb team-stats list [--project <id>] [--thread <id>] [--archived] [--json]",
        };
      const input = {
        projectId: null as string | null,
        threadId: null as string | null,
        archived: false,
      };
      let json = false;
      while (args.length) {
        const flag = args.shift();
        if (flag === "--json") json = true;
        else if (flag === "--archived") input.archived = true;
        else if (
          (flag === "--project" || flag === "--thread") &&
          args[0] &&
          !args[0].startsWith("--")
        ) {
          const value = args.shift()!;
          if (flag === "--project") input.projectId = value;
          else input.threadId = value;
        } else return { exitCode: 1, stderr: "Invalid arguments" };
      }
      const result = await serializedScan(querySchema.parse(input));
      const limited = {
        ...result,
        runs: result.runs.slice(0, 100),
        outputTruncated: result.runs.length > 100,
      };
      while (
        Buffer.byteLength(JSON.stringify(limited)) > 48000 &&
        limited.runs.length
      ) {
        limited.runs.pop();
        limited.outputTruncated = true;
      }
      return {
        exitCode: 0,
        stdout: json
          ? JSON.stringify(limited)
          : `${result.scannedThreads} threads; ${result.runs.length} runs; partial=${result.partial}; failed reads=${result.failedThreads}; output truncated=${limited.outputTruncated}\n` +
            limited.runs
              .map(
                (r) =>
                  `${r.member} · ${r.provider} · ${r.model}: ${r.state}, ${r.tokens ?? "unknown"} tokens, ${r.durationMs ?? "unknown"} ms`,
              )
              .join("\n"),
      };
    },
  });
}
