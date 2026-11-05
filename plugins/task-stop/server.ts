import { execFile } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  findRunningTask,
  foldRunningTasks,
  isSafeId,
  outputFileName,
  stopMessage,
  stopRequestSchema,
  TASK_EVENT_TYPES,
  type EventRow,
  type RunningTask,
} from "./lib/tasks.ts";

const run = promisify(execFile);
const PAGE_SIZE = 100;
const KILL_GRACE_MS = 2_000;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Claude Code writes a background command's output to `<tmp>/claude-<uid>/<cwd>/<session>/tasks/<task>.output`. */
async function findOutputFile(task: RunningTask): Promise<string | null> {
  if (task.sessionId === null || !isSafeId(task.sessionId) || !isSafeId(task.taskId)) return null;
  const roots = new Set([process.env.CLAUDE_CODE_TMPDIR, "/private/tmp", "/tmp", tmpdir()].filter(Boolean) as string[]);
  for (const root of roots) {
    const base = join(root, `claude-${userInfo().uid}`);
    let projects: string[];
    try {
      projects = await readdir(base);
    } catch {
      continue;
    }
    for (const project of projects) {
      const file = join(base, project, task.sessionId, "tasks", outputFileName(task.taskId));
      if (await exists(file)) return file;
    }
  }
  return null;
}

async function pidsWriting(file: string): Promise<number[]> {
  try {
    const { stdout } = await run("lsof", ["-t", "--", file], { timeout: 5_000 });
    return stdout
      .split("\n")
      .map((line) => Number.parseInt(line, 10))
      .filter((pid) => Number.isInteger(pid) && pid > 1 && pid !== process.pid);
  } catch {
    return [];
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killAll(pids: number[]): Promise<void> {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, KILL_GRACE_MS));
  for (const pid of pids.filter(alive)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

export default async function plugin(bb: BbPluginApi) {
  async function runningTasks(threadId: string): Promise<RunningTask[]> {
    const rows: EventRow[] = [];
    let afterSeq: number | undefined;
    for (;;) {
      const page = await bb.sdk.threads.events.list({
        threadId,
        types: TASK_EVENT_TYPES,
        order: "asc",
        afterSeq: afterSeq === undefined ? undefined : String(afterSeq),
        limit: String(PAGE_SIZE),
      });
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      afterSeq = page[page.length - 1]!.seq;
    }
    return foldRunningTasks(rows);
  }

  bb.http.route("POST", "/stop", async (context) => {
    const parsed = stopRequestSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ ok: false, error: "Invalid stop request" }, 400);
    const { threadId, description, index } = parsed.data;
    const task = findRunningTask(await runningTasks(threadId), description, index);
    if (task === null) return context.json({ ok: false, error: "This task is no longer running" }, 404);

    if (task.kind === "command") {
      const file = await findOutputFile(task);
      const pids = file === null ? [] : await pidsWriting(file);
      if (pids.length > 0) {
        await killAll(pids);
        bb.log.info(`stopped background command ${task.taskId} in ${threadId} (pids ${pids.join(", ")})`);
        return context.json({ ok: true, via: "killed" });
      }
    }

    await bb.sdk.threads.send({
      threadId,
      mode: "steer-if-active",
      input: [{ type: "text", text: stopMessage(task), mentions: [] }],
    });
    bb.log.info(`asked ${threadId} to stop background ${task.kind} ${task.taskId}`);
    return context.json({ ok: true, via: "asked" });
  });
}
