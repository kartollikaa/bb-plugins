import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "github-folder-production-"));
const plugin = join(temporary, "plugin");

try {
  await cp(source, plugin, {
    recursive: true,
    filter: (path) => !["node_modules", "dist", ".git"].includes(basename(path)),
  });
  execFileSync("npm", ["ci", "--omit=dev", "--omit=optional", "--ignore-scripts", "--cache", join(temporary, "npm-cache")], {
    cwd: plugin,
    stdio: "inherit",
  });
  execFileSync(process.env.BB_CLI ?? "bb", ["plugin", "build", plugin], { cwd: plugin, stdio: "inherit" });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
