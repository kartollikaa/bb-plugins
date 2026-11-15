import { realpath, lstat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { z } from "zod";
import { readerProgram } from "./read-helper.ts";
const readerResult = z
  .object({
    data: z.string().nullable(),
    error: z.string().nullable(),
    revoked: z.boolean(),
  })
  .strict();
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { createHash } from "node:crypto";
import { reportSchema } from "./schema.ts";
export class AccessError extends Error {}
export async function canonical(root: string, path: string) {
  if (
    isAbsolute(path) ||
    path.split(/[\\/]/).some((s) => s === ".." || s === "." || !s)
  )
    throw new AccessError("Source path denied");
  const base = await realpath(root),
    target = resolve(base, path);
  let cursor = base;
  for (const part of relative(base, target).split("/")) {
    cursor = resolve(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink())
      throw new AccessError("Symlink sources are denied");
  }
  const actual = await realpath(target),
    rel = relative(base, actual);
  if (rel.startsWith("..") || isAbsolute(rel))
    throw new AccessError("Source escaped its root");
  return actual;
}
export async function readFileSource(
  root: string,
  path: string,
  signal?: AbortSignal,
) {
  try {
    const result = await secureRead(root, path, signal);
    if (result.error || result.data === null)
      return {
        report: null,
        revision: null,
        error: result.error,
        revoked: result.revoked,
      };
    const raw = Buffer.from(result.data, "base64");
    const parsed = reportSchema.safeParse(JSON.parse(raw.toString("utf8")));
    if (!parsed.success)
      throw new Error("Report does not match the Live UI schema");
    return {
      report: parsed.data,
      revision: createHash("sha256").update(raw).digest("hex").slice(0, 12),
      error: null,
      revoked: false,
    };
  } catch (e) {
    return {
      report: null,
      revision: null,
      error:
        e instanceof SyntaxError
          ? "Invalid or partial JSON"
          : e instanceof Error
            ? e.message
            : "Source unavailable",
      revoked: false,
    };
  }
}
async function secureRead(
  root: string,
  path: string,
  signal?: AbortSignal,
): Promise<{ data: string | null; error: string | null; revoked: boolean }> {
  return new Promise((resolveResult) => {
    const child = spawn("python3", ["-I", "-c", readerProgram], {
      stdio: ["pipe", "pipe", "ignore"],
      shell: false,
      signal,
    });
    let output = "",
      finished = false;
    const finish = (result: {
      data: string | null;
      error: string | null;
      revoked: boolean;
    }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    const unavailable = () =>
      finish({
        data: null,
        error:
          "Secure file reader unavailable: requires Python 3 with directory-relative open and O_NOFOLLOW",
        revoked: true,
      });
    const timer = setTimeout(() => {
      child.kill();
      finish({
        data: null,
        error: "Secure file reader timed out",
        revoked: false,
      });
    }, 5000);
    child.on("error", (error) => {
      if (error.name === "AbortError")
        finish({ data: null, error: "Source read cancelled", revoked: false });
      else unavailable();
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 400000) {
        child.kill();
        unavailable();
      }
    });
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      if (code !== 0) {
        unavailable();
        return;
      }
      try {
        finish(readerResult.parse(JSON.parse(output)));
      } catch {
        unavailable();
      }
    });
    child.stdin.end(JSON.stringify({ root, path }));
  });
}
export { dirname };
