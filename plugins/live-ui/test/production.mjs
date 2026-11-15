import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const temp = await mkdtemp(join(tmpdir(), "live-ui-production-"));
try {
  const source = fileURLToPath(new URL("..", import.meta.url));
  const target = join(temp, "plugin");
  await cp(source, target, {
    recursive: true,
    filter: (p) => !["node_modules", "dist", ".git"].includes(basename(p)),
  });
  for (const [command, args] of [
    [
      "npm",
      [
        "ci",
        "--omit=dev",
        "--omit=optional",
        "--ignore-scripts",
        "--cache",
        join(temp, "cache"),
      ],
    ],
    ["bb", ["plugin", "build"]],
  ]) {
    const result = spawnSync(command, args, { cwd: target, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`${command} failed (${result.status})`);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
