import { open, realpath, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { createHash } from "node:crypto";
import { reportSchema } from "./schema.ts";
export class AccessError extends Error {}
export async function canonical(
  root: string,
  path: string,
  openFile: typeof open = open,
) {
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
  openFile: typeof open = open,
) {
  try {
    const target = await canonical(root, path);
    const fd = await openFile(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await fd.stat();
      if (!stat.isFile() || stat.size > 262144)
        throw new Error("Source must be a regular JSON file up to 256 KiB");
      const buffer = Buffer.alloc(262145),
        { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 262144) throw new Error("Source exceeds 256 KiB");
      if ((await canonical(root, path)) !== target)
        throw new AccessError("Source changed location");
      const current = await lstat(target);
      if (
        current.dev !== stat.dev ||
        current.ino !== stat.ino ||
        !current.isFile()
      )
        throw new AccessError(
          "Opened source no longer matches its authorized path",
        );
      const raw = buffer.subarray(0, bytesRead);
      const parsed = reportSchema.safeParse(JSON.parse(raw.toString("utf8")));
      if (!parsed.success)
        throw new Error("Report does not match the Live UI schema");
      return {
        report: parsed.data,
        revision: createHash("sha256").update(raw).digest("hex").slice(0, 12),
        error: null,
        revoked: false,
      };
    } finally {
      await fd.close();
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    const revoked =
      e instanceof AccessError ||
      ["EACCES", "EPERM", "ELOOP"].includes(code ?? "");
    return {
      report: null,
      revision: null,
      error: revoked
        ? "Source access denied"
        : code === "ENOENT"
          ? "Source removed"
          : e instanceof SyntaxError
            ? "Invalid or partial JSON"
            : e instanceof Error && !code
              ? e.message
              : "Source unavailable",
      revoked,
    };
  }
}
export { dirname };
