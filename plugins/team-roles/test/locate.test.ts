import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, findTeamInstall, type LocateDeps } from "../lib/locate.ts";

const FILES = ["roles.json", "scripts/render_roles.py", "scripts/install_codex_agents.py"];

function deps(world: { files?: string[]; json?: Record<string, unknown>; dirs?: Record<string, string[]>; settingRoot?: string }): LocateDeps {
  const files = new Set(world.files ?? []);
  return {
    claudeDir: "/c",
    settingRoot: world.settingRoot ?? "",
    readJson: async (path) => world.json?.[path] ?? null,
    isFile: async (path) => files.has(path),
    listDir: async (path) => world.dirs?.[path] ?? [],
  };
}
const full = (root: string) => FILES.map((file) => `${root}/${file}`);
const entry = (installPath: string, version: string, scope = "user") => ({ scope, installPath, version, gitCommitSha: "abc1234def" });

test("the teamRoot setting wins and carries the manifest version", async () => {
  const found = await findTeamInstall(
    deps({ settingRoot: "/src/team", files: full("/src/team"), json: { "/src/team/.claude-plugin/plugin.json": { version: "0.3.0" }, "/c/plugins/installed_plugins.json": { plugins: { "team@m": [entry("/x", "9.9.9")] } } } }),
  );
  assert.deepEqual(found, { root: "/src/team", version: "0.3.0", key: null, scope: null, commit: null, enabled: null, source: "setting", others: [] });
});

test("a teamRoot without the team files is an error naming the folder", async () => {
  const found = await findTeamInstall(deps({ settingRoot: "/empty", files: [] }));
  assert.ok("error" in found && found.error.includes("/empty"));
});

test("installed_plugins.json: user scope, enabled marketplace beats a newer disabled one, the rest go to others", async () => {
  const found = await findTeamInstall(
    deps({
      files: [...full("/a/1.0.0"), ...full("/b/2.0.0"), ...full("/p/3.0.0")],
      json: {
        "/c/plugins/installed_plugins.json": {
          version: 2,
          plugins: {
            "team@a": [entry("/a/1.0.0", "1.0.0")],
            "team@b": [entry("/b/2.0.0", "2.0.0"), entry("/p/3.0.0", "3.0.0", "project")],
            "other@a": [entry("/o", "1")],
          },
        },
        "/c/settings.json": { enabledPlugins: { "team@a": true, "team@b": false } },
      },
    }),
  );
  assert.ok(!("error" in found));
  assert.equal(found.root, "/a/1.0.0");
  assert.equal(found.key, "team@a");
  assert.equal(found.enabled, true);
  assert.equal(found.commit, "abc1234def");
  assert.equal(found.source, "installed_plugins");
  assert.deepEqual(found.others, ["team@b 2.0.0 (user scope)", "team@b 3.0.0 (project scope)"]);
  assert.ok(!JSON.stringify(found).includes("other@a"));
});

test("with no enabled entry the highest version wins", async () => {
  const found = await findTeamInstall(
    deps({
      files: [...full("/a/0.9.0"), ...full("/b/0.10.0")],
      json: { "/c/plugins/installed_plugins.json": { plugins: { "team@a": [entry("/a/0.9.0", "0.9.0")], "team@b": [entry("/b/0.10.0", "0.10.0")] } } },
    }),
  );
  assert.ok(!("error" in found));
  assert.equal(found.key, "team@b");
  assert.equal(found.enabled, null);
});

test("a team entry whose folder is incomplete or not user scope is an error, not a silent scan", async () => {
  const found = await findTeamInstall(
    deps({ files: [], json: { "/c/plugins/installed_plugins.json": { plugins: { "team@a": [entry("/gone", "1.0.0")] } } } }),
  );
  assert.ok("error" in found && found.error.includes("team@a 1.0.0"));
});

test("cache scan when installed_plugins.json is missing: numeric order, junk folders skipped", async () => {
  const found = await findTeamInstall(
    deps({
      files: [...full("/c/plugins/cache/m/team/0.2.0"), ...full("/c/plugins/cache/m/team/0.10.0"), ...full("/c/plugins/cache/m/team/latest")],
      dirs: { "/c/plugins/cache": ["m"], "/c/plugins/cache/m/team": ["0.2.0", "0.10.0", "latest"] },
    }),
  );
  assert.ok(!("error" in found));
  assert.equal(found.version, "0.10.0");
  assert.equal(found.key, "team@m");
  assert.equal(found.source, "cache-scan");
  assert.equal(found.enabled, null);
  assert.deepEqual(found.others, ["team@m 0.2.0"]);
});

test("nothing anywhere is a named error", async () => {
  const found = await findTeamInstall(deps({}));
  assert.deepEqual(found, { error: "team plugin not found in /c/plugins" });
});

test("a garbage installed_plugins.json falls back to the scan", async () => {
  const found = await findTeamInstall(
    deps({ files: full("/c/plugins/cache/m/team/1.0"), json: { "/c/plugins/installed_plugins.json": "nope" }, dirs: { "/c/plugins/cache": ["m"], "/c/plugins/cache/m/team": ["1.0"] } }),
  );
  assert.ok(!("error" in found));
  assert.equal(found.source, "cache-scan");
});

test("compareVersions is numeric", () => {
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
  assert.ok(compareVersions("1.0", "1.0.0") === 0);
});
