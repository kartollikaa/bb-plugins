import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createStampedCache } from "../lib/cache.ts";
import { buildSnapshot, type SnapshotDeps } from "../lib/snapshot.ts";
import { formatList, parseSubPath, generatedFiles, roleDetailState, tildePath } from "../lib/view.ts";
import type { RunResult } from "../lib/schema.ts";

const roles = readFileSync(new URL("./fixtures/roles.json", import.meta.url), "utf8");
const ok = (stdout = "", stderr = ""): RunResult => ({ exitCode: 0, stdout, stderr, failure: null });
const D = "/h/.codex/agents";
const plan = ["designer", "implementer", "planner", "researcher", "reviewer", "runner"].map((r) => `unchanged ${D}/team-${r}.toml`).join("\n");

function deps(overrides: Partial<SnapshotDeps> = {}): SnapshotDeps {
  return {
    locate: async () => ({ root: "/h/.claude/plugins/cache/m/team/0.2.0", version: "0.2.0", key: "team@m", scope: "user", commit: null, enabled: true, source: "installed_plugins", others: [] }),
    readText: async () => roles,
    run: async (_root, call) => (call.kind === "codex-plan" ? ok(`${plan}\ndry run: nothing changed; rerun with --apply\n`) : ok()),
    hostId: async () => "host-1",
    now: () => 1000,
    ...overrides,
  };
}

test("the real 0.2.0 shapes give six roles, current files, installed Codex", async () => {
  const snapshot = await buildSnapshot(deps());
  assert.equal(snapshot.roles.length, 6);
  assert.equal(snapshot.generated.state, "current");
  assert.equal(snapshot.codex.state, "installed");
  assert.equal(snapshot.hostId, "host-1");
  const text = formatList(snapshot, "/h");
  assert.match(text, /^team 0\.2\.0 · team@m · user scope · enabled\n/);
  assert.match(text, /root: ~\/\.claude\/plugins\/cache\/m\/team\/0\.2\.0/);
  assert.match(text, /generated files: current/);
  assert.match(text, /codex agents: 6 installed, current \(~\/\.codex\/agents\)/);
  assert.match(text, /^reviewer\s+opus\/high\s+gpt-6\.1-sol\/high\s+read-only, shell$/m);
});

test("no install: named state in every part, nothing throws", async () => {
  const snapshot = await buildSnapshot(deps({ locate: async () => ({ error: "team plugin not found in /h/.claude/plugins" }) }));
  assert.equal(snapshot.install, null);
  assert.equal(snapshot.installError, "team plugin not found in /h/.claude/plugins");
  assert.equal(snapshot.generated.state, "unknown");
  assert.equal(snapshot.codex.state, "unknown");
  assert.equal(formatList(snapshot, "/h"), "team plugin not found in /h/.claude/plugins");
});

test("python3 missing and an unreadable roles.json: roles render, the checks say unknown", async () => {
  const missing: RunResult = { exitCode: null, stdout: "", stderr: "", failure: "python3 not found" };
  const snapshot = await buildSnapshot(deps({ run: async () => missing }));
  assert.equal(snapshot.roles.length, 6);
  assert.equal(snapshot.generated.error, "python3 not found");
  assert.equal(snapshot.codex.message, "python3 not found");
  const broken = await buildSnapshot(deps({ readText: async () => null }));
  assert.equal(broken.rolesError, "roles.json can't be read");
  assert.equal(broken.generated.state, "current");
});

test("throwing readers and runners never escape", async () => {
  const snapshot = await buildSnapshot(
    deps({ locate: async () => { throw new Error("boom"); } }),
  );
  assert.match(snapshot.installError ?? "", /boom/);
  const runThrows = await buildSnapshot(deps({ run: async () => { throw new Error("spawn failed"); }, hostId: async () => { throw new Error("x"); } }));
  assert.equal(runThrows.generated.error, "spawn failed");
  assert.equal(runThrows.hostId, null);
});

test("stamped cache shares one run and reruns when the stamp changes", async () => {
  const cache = createStampedCache<number>();
  let runs = 0;
  const produce = async () => ++runs;
  const [a, b] = await Promise.all([cache.get("k", "1", produce), cache.get("k", "1", produce)]);
  assert.deepEqual([a, b, runs], [1, 1, 1]);
  assert.equal(await cache.get("k", "2", produce), 2);
  cache.clear();
  assert.equal(await cache.get("k", "2", produce), 3);
});

test("sub paths and small view helpers", () => {
  assert.deepEqual(parseSubPath(""), { kind: "list" });
  assert.deepEqual(parseSubPath(undefined), { kind: "list" });
  assert.deepEqual(parseSubPath("/role/reviewer/"), { kind: "role", name: "reviewer" });
  assert.deepEqual(parseSubPath("role/propose"), { kind: "role", name: "propose" });
  assert.deepEqual(parseSubPath("propose"), { kind: "propose", name: null });
  assert.deepEqual(parseSubPath("propose/reviewer"), { kind: "propose", name: "reviewer" });
  assert.deepEqual(parseSubPath("nonsense"), { kind: "list" });
  assert.equal(tildePath("/h/x", "/h"), "~/x");
  assert.equal(tildePath("/hh/x", "/h"), "/hh/x");
});

test("a role's generated files follow its runtimes", async () => {
  const snapshot = await buildSnapshot(deps());
  const reviewer = snapshot.roles.find((r) => r.name === "reviewer");
  assert.ok(reviewer);
  assert.deepEqual(generatedFiles(reviewer), ["agents/reviewer.md", "codex/agents/team-reviewer.toml"]);
});

test("role detail picks the state: loading, not installed, roles error, unknown role, ok", async () => {
  const good = await buildSnapshot(deps());
  const row = good.roles[0];
  assert.deepEqual(roleDetailState(undefined, undefined, true), { kind: "loading" });
  assert.deepEqual(roleDetailState(good, undefined, true), { kind: "loading" });
  assert.equal(roleDetailState(good, row, false).kind, "ok");
  assert.deepEqual(roleDetailState(good, undefined, false), { kind: "not-found", version: good.install?.version ?? "?" });
  const none = { ...good, install: null, installError: "team plugin not found", roles: [] };
  assert.deepEqual(roleDetailState(none, undefined, false), { kind: "not-installed", installError: "team plugin not found" });
  const broken = { ...good, rolesError: "roles.json: unsupported version 2", roles: [] };
  assert.deepEqual(roleDetailState(broken, undefined, false), { kind: "roles-error", message: "roles.json: unsupported version 2" });
});
