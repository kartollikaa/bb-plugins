import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const rpcContract = defineRpcContract({
  reveal: {
    input: z.object({ href: z.string().min(1).max(4096) }),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true), path: z.string() }),
      z.object({ ok: z.literal(false), reason: z.string() }),
    ]),
  },
});

export type RevealResult = { ok: true; path: string } | { ok: false; reason: string };

export function hrefToPath(href: string): string | null {
  let path: string;
  try {
    path = href.startsWith("file:") ? fileURLToPath(href) : href;
  } catch {
    return null;
  }
  if (path.includes("\0") || !isAbsolute(path)) return null;
  return normalize(path);
}

function openReveal(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("open", ["-R", path], (error) => (error ? reject(error) : resolve()));
  });
}

export async function reveal(
  href: string,
  run: (path: string) => Promise<void> = openReveal,
  platform: string = process.platform,
): Promise<RevealResult> {
  if (platform !== "darwin") return { ok: false, reason: "Finder exists only on macOS" };
  const path = hrefToPath(href);
  if (path === null) return { ok: false, reason: "Not a local file path" };
  if (!existsSync(path)) return { ok: false, reason: "File not found" };
  await run(path);
  return { ok: true, path };
}

export default async function plugin(bb: BbPluginApi) {
  bb.rpc.register(rpcContract, {
    reveal: ({ href }) => reveal(href),
  });

  const usage = "Usage: bb reveal-in-finder <absolute-path>";
  bb.cli.register({
    name: "reveal-in-finder",
    summary: "Show a file or folder in Finder on the Mac that runs the bb server",
    commands: [{ name: "<path>", summary: "Reveal the path in Finder", usage }],
    async run(argv) {
      const [target] = argv;
      if (target === undefined) return { exitCode: 1, stderr: usage };
      if (target === "--help" || target === "help") return { exitCode: 0, stdout: usage };
      const result = await reveal(target);
      return result.ok
        ? { exitCode: 0, stdout: `Revealed ${result.path}` }
        : { exitCode: 1, stderr: result.reason };
    },
  });
}
