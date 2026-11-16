import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseCheck, parseCodexPlan, parseResolve, parseRolesJson } from "../lib/parse.ts";
import type { RunResult } from "../lib/schema.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const run = (exitCode: number | null, stdout = "", stderr = "", failure: string | null = null): RunResult => ({ exitCode, stdout, stderr, failure });
const ROOT = "/t/0.2.0";
const D = "/home/u/.codex/agents";
const UNCHANGED = ["designer", "implementer", "planner", "researcher", "reviewer", "runner"].map((r) => `unchanged ${D}/team-${r}.toml`).join("\n");

test("roles.json of team 0.2.0: six roles by name, both runtimes", () => {
  const { roles, error } = parseRolesJson(fixture("roles.json"));
  assert.equal(error, null);
  assert.deepEqual(roles.map((r) => r.name), ["designer", "implementer", "planner", "researcher", "reviewer", "runner"]);
  const reviewer = roles.find((r) => r.name === "reviewer");
  assert.equal(reviewer?.access, "read-only");
  assert.equal(reviewer?.runtimes["claude-code"]?.model, "opus");
  assert.equal(reviewer?.runtimes["codex"]?.agent, "team-reviewer");
  assert.ok((reviewer?.runtimes["codex"]?.unenforced.length ?? 0) > 0);
});

test("roles.json: unreadable, not JSON, other version, wrong shape", () => {
  assert.equal(parseRolesJson(null).error, "roles.json can't be read");
  assert.equal(parseRolesJson("{").error, "roles.json is not valid JSON");
  assert.equal(parseRolesJson('{"version":2,"roles":{}}').error, "roles.json: version 2 is not supported");
  assert.match(parseRolesJson('{"version":1,"roles":{"a":{"intent":1}}}').error ?? "", /^roles\.json: roles\.a\./);
  assert.match(parseRolesJson('{"version":1,"roles":{"Bad Name":{}}}').error ?? "", /roles\.json/);
});

test("a third runtime in roles.json appears without a code change", () => {
  const data = JSON.parse(fixture("roles.json"));
  for (const role of Object.values<any>(data.roles)) role.runtimes.gemini = { ...role.runtimes.codex, agent: "x" };
  const { roles, error } = parseRolesJson(JSON.stringify(data));
  assert.equal(error, null);
  assert.ok(roles.every((role) => "gemini" in role.runtimes));
});

test("resolve: the real reviewer outputs give the prompt and no difference from the table", () => {
  const table = parseRolesJson(fixture("roles.json")).roles.find((r) => r.name === "reviewer");
  for (const runtime of ["claude-code", "codex"]) {
    const result = parseResolve(run(0, fixture(`resolve-reviewer-${runtime}.json`)), table?.runtimes[runtime] ?? null);
    assert.equal(result.error, null);
    assert.match(result.prompt ?? "", /^You review work you did not write/);
    assert.deepEqual(result.differsFromTable, []);
  }
});

test("resolve: marks fields where it disagrees with the table; names failures", () => {
  const table = parseRolesJson(fixture("roles.json")).roles.find((r) => r.name === "reviewer")?.runtimes["codex"] ?? null;
  assert.ok(table);
  const changed = parseResolve(run(0, fixture("resolve-reviewer-codex.json")), { ...table, model: "other", effort: "low" });
  assert.deepEqual(changed.differsFromTable, ["model", "effort"]);
  assert.equal(parseResolve(run(1, "", "error: unknown role: nope\n"), table).error, "error: unknown role: nope");
  assert.equal(parseResolve(run(null, "", "", "python3 not found"), table).error, "python3 not found");
  assert.match(parseResolve(run(0, "not json"), table).error ?? "", /other than JSON/);
  assert.match(parseResolve(run(0, '{"role":"x"}'), table).error ?? "", /without the expected keys/);
});

test("--check: fresh copy is current", () => {
  assert.deepEqual(parseCheck(run(0)), { state: "current", problems: [], error: null, other: [] });
});

test("--check: stale copy lists the three problem lines and not the advice line", () => {
  const stderr = "stale: agents/reviewer.md\nstale: codex/agents/team-reviewer.toml\nnot produced by any role: codex/agents/team-ghost.toml\nrun scripts/render_roles.py and commit the result\n";
  const result = parseCheck(run(1, "", stderr));
  assert.equal(result.state, "stale");
  assert.deepEqual(result.problems, ["stale: agents/reviewer.md", "stale: codex/agents/team-reviewer.toml", "not produced by any role: codex/agents/team-ghost.toml"]);
  assert.deepEqual(result.other, []);
  assert.equal(parseCheck(run(1, "", "missing: agents/runner.md\n")).state, "stale");
});

test("--check: an unknown tier is invalid with the message", () => {
  const result = parseCheck(run(1, "", "error: claude-code: no tier mapping for runner's 'huge'\n"));
  assert.equal(result.state, "invalid");
  assert.equal(result.error, "claude-code: no tier mapping for runner's 'huge'");
});

test("--check: garbage never reads as current", () => {
  assert.deepEqual(parseCheck(run(1, "", "")).state, "unknown");
  assert.equal(parseCheck(run(1, "", "weather is nice")).error, "--check failed without a reason");
  assert.equal(parseCheck(run(1, "", "weather is nice")).other[0], "weather is nice");
  assert.equal(parseCheck(run(2, "", "")).state, "unknown");
  assert.equal(parseCheck(run(null, "", "", "timed out after 10 s")).error, "timed out after 10 s");
  assert.equal(parseCheck(run(0, "surprise on stdout")).other[0], "surprise on stdout");
});

test("installer: six unchanged lines is installed, with the destination", () => {
  const result = parseCodexPlan(run(0, `${UNCHANGED}\ndry run: nothing changed; rerun with --apply\n`), ROOT);
  assert.equal(result.state, "installed");
  assert.equal(result.dest, D);
  assert.equal(result.steps.length, 6);
  assert.equal(result.applyCommand, null);
  assert.deepEqual(result.other, []);
});

test("installer: all install lines is not-installed with the apply command", () => {
  const stdout = ["designer", "planner"].map((r) => `install ${D}/team-${r}.toml`).join("\n") + "\ndry run: nothing changed; rerun with --apply\n";
  const result = parseCodexPlan(run(0, stdout), ROOT);
  assert.equal(result.state, "not-installed");
  assert.equal(result.applyCommand, `python3 ${ROOT}/scripts/install_codex_agents.py --apply`);
});

test("installer: a mix of update and unchanged is pending", () => {
  const result = parseCodexPlan(run(0, `update ${D}/team-reviewer.toml\nunchanged ${D}/team-runner.toml\n`), ROOT);
  assert.equal(result.state, "pending");
  assert.ok(result.applyCommand);
});

test("installer: conflict, forget and keep together are a conflict (exit 1); summaries tolerated", () => {
  const stdout = [`install ${D}/team-designer.toml`, `conflict ${D}/team-reviewer.toml`, `forget ${D}/team-gone.toml`, `keep ${D}/team-old.toml`, "dry run: nothing changed; rerun with --apply"].join("\n");
  const stderr = "edited after install and no role produces them any more, so they stay as your own files: team-old.toml\nleft alone, edited since install or not written by this script: team-reviewer.toml; compare, then rerun with --force to replace\n";
  const result = parseCodexPlan(run(1, stdout, stderr), ROOT);
  assert.equal(result.state, "conflict");
  assert.deepEqual(result.other, []);
  assert.equal(result.steps.filter((s) => s.action === "keep").length, 1);
});

test("installer: stale generated files block it, with the problem lines", () => {
  const stderr = "stale: agents/reviewer.md\nerror: generated files are not current; run scripts/render_roles.py first\n";
  const result = parseCodexPlan(run(1, "", stderr), ROOT);
  assert.equal(result.state, "blocked");
  assert.deepEqual(result.problems, ["stale: agents/reviewer.md"]);
});

test("installer: other errors, empty plans, contradictions and failures are unknown, never installed", () => {
  assert.deepEqual([parseCodexPlan(run(1, "", "error: manifest is not ours\n"), ROOT).state, parseCodexPlan(run(1, "", "error: manifest is not ours\n"), ROOT).message], ["unknown", "manifest is not ours"]);
  assert.equal(parseCodexPlan(run(0, "dry run: nothing changed; rerun with --apply\n"), ROOT).message, "the installer planned nothing");
  assert.equal(parseCodexPlan(run(0, ""), ROOT).state, "unknown");
  assert.equal(parseCodexPlan(run(0, `conflict ${D}/team-a.toml\n`), ROOT).state, "unknown");
  assert.equal(parseCodexPlan(run(1, `unchanged ${D}/team-a.toml\n`), ROOT).state, "unknown");
  assert.equal(parseCodexPlan(run(3, UNCHANGED), ROOT).state, "unknown");
  assert.equal(parseCodexPlan(run(null, "", "", "timed out after 10 s"), ROOT).message, "timed out after 10 s");
  const noisy = parseCodexPlan(run(0, `${UNCHANGED}\nlook at this\n`), ROOT);
  assert.equal(noisy.state, "installed");
  assert.deepEqual(noisy.other, ["look at this"]);
});

test("the apply command quotes a root with spaces", () => {
  const result = parseCodexPlan(run(0, `install ${D}/team-a.toml\n`), "/My Files/team");
  assert.equal(result.applyCommand, "python3 '/My Files/team/scripts/install_codex_agents.py' --apply");
});
