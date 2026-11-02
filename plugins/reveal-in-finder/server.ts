import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const target = z.object({
  path: z.string().min(1).max(4096),
  threadId: z.string().max(200).nullable(),
});

const fileInfo = z.discriminatedUnion("exists", [
  z.object({
    exists: z.literal(true),
    path: z.string(),
    name: z.string(),
    kind: z.enum(["file", "folder"]),
    extension: z.string(),
    bytes: z.number(),
    hostId: z.string().nullable(),
  }),
  z.object({ exists: z.literal(false), path: z.string().nullable(), name: z.string() }),
]);

export const rpcContract = defineRpcContract({
  describe: { input: target, output: fileInfo },
  open: {
    input: target.extend({ app: z.enum(["finder", "default"]) }),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true) }),
      z.object({ ok: z.literal(false), reason: z.string() }),
    ]),
  },
});

export type FileInfo = z.infer<typeof fileInfo>;
export type OpenApp = "finder" | "default";

/** Turns an untrusted path, `~/…` path or `file:` URL into an absolute path; `base` resolves relative ones. */
export function toAbsolutePath(raw: string, base: string | null): string | null {
  let path: string;
  try {
    path = raw.startsWith("file:") ? fileURLToPath(raw) : raw;
  } catch {
    return null;
  }
  if (path.includes("\0")) return null;
  if (path === "~" || path.startsWith("~/")) path = join(homedir(), path.slice(1));
  if (!isAbsolute(path)) {
    if (base === null) return null;
    path = join(base, path);
  }
  return normalize(path);
}

export function openArgs(path: string, app: OpenApp): string[] {
  return app === "finder" ? ["-R", path] : [path];
}

function runOpen(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("open", args, (error) => (error ? reject(error) : resolve()));
  });
}

export default async function plugin(bb: BbPluginApi) {
  async function worktreeOf(threadId: string | null): Promise<string | null> {
    if (threadId === null) return null;
    try {
      const thread = (await bb.sdk.threads.get({ threadId })) as { environmentId?: string | null };
      if (!thread.environmentId) return null;
      const environment = (await bb.sdk.environments.get({ environmentId: thread.environmentId })) as {
        path?: string | null;
      };
      return environment.path ?? null;
    } catch {
      return null;
    }
  }

  async function resolve(raw: string, threadId: string | null): Promise<string | null> {
    return toAbsolutePath(raw, isAbsolute(raw) || raw.startsWith("file:") || raw.startsWith("~") ? null : await worktreeOf(threadId));
  }

  async function primaryHostId(): Promise<string | null> {
    try {
      return (await bb.sdk.system.config()).primaryHostId ?? null;
    } catch {
      return null;
    }
  }

  async function describe(raw: string, threadId: string | null): Promise<FileInfo> {
    const path = await resolve(raw, threadId);
    const name = basename(path ?? raw) || raw;
    if (path === null) return { exists: false, path: null, name };
    try {
      const info = await stat(path);
      return {
        exists: true,
        path,
        name,
        kind: info.isDirectory() ? "folder" : "file",
        extension: info.isDirectory() ? "" : extname(path).slice(1).toLowerCase(),
        bytes: info.isDirectory() ? 0 : info.size,
        hostId: await primaryHostId(),
      };
    } catch {
      return { exists: false, path, name };
    }
  }

  async function open(raw: string, threadId: string | null, app: OpenApp) {
    if (process.platform !== "darwin") return { ok: false as const, reason: "Needs macOS" };
    const info = await describe(raw, threadId);
    if (!info.exists) return { ok: false as const, reason: "File not found" };
    await runOpen(openArgs(info.path, app));
    return { ok: true as const };
  }

  bb.rpc.register(rpcContract, {
    describe: ({ path, threadId }) => describe(path, threadId),
    open: ({ path, threadId, app }) => open(path, threadId, app),
  });

  const usage = "Usage: bb reveal-in-finder show <absolute-path>";
  bb.cli.register({
    name: "reveal-in-finder",
    summary: "Show a file or folder in Finder on the Mac that runs the bb server",
    commands: [{ name: "show", summary: "Reveal the path in Finder", usage }],
    async run(argv) {
      const [command, path, ...rest] = argv;
      if (command === "--help" || command === "help") return { exitCode: 0, stdout: usage };
      if (command !== "show" || path === undefined || rest.length > 0) return { exitCode: 1, stderr: usage };
      const result = await open(path, null, "finder");
      return result.ok ? { exitCode: 0, stdout: `Revealed ${path}` } : { exitCode: 1, stderr: result.reason };
    },
  });
}
