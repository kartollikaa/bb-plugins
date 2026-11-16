import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { findSourceProject, marketplaceRepo, normaliseRepo, proposalBrief } from "../lib/brief.ts";
import { parseRolesJson } from "../lib/parse.ts";
import type { GeneratedStatus, InstallInfo } from "../lib/schema.ts";

const roles = parseRolesJson(readFileSync(new URL("./fixtures/roles.json", import.meta.url), "utf8")).roles;
const install: InstallInfo = { root: "/r", version: "0.2.0", key: "team@kartollika-ai-hub", scope: "user", commit: "4451618a1eab872d5f5125148cb430c164e82e43", enabled: true, source: "installed_plugins", others: [] };
const current: GeneratedStatus = { state: "current", problems: [], error: null, other: [] };

test("every spelling of the repo normalises to one key", () => {
  const key = "github.com/kartollikaa/kartollika-ai-hub";
  for (const value of [
    "https://github.com/kartollikaa/kartollika-ai-hub.git",
    "https://github.com/KartollikaA/kartollika-ai-hub/",
    "git@github.com:kartollikaa/kartollika-ai-hub.git",
    "ssh://git@github.com/kartollikaa/kartollika-ai-hub",
    "kartollikaa/kartollika-ai-hub",
    "github.com/kartollikaa/kartollika-ai-hub",
  ]) assert.equal(normaliseRepo(value), key, value);
  assert.equal(normaliseRepo(""), null);
  assert.equal(normaliseRepo("nonsense"), null);
  assert.equal(normaliseRepo("https://git.example.com:8443/o/r.git"), "git.example.com:8443/o/r");
});

test("marketplace sources: git url, github repo, junk", () => {
  assert.equal(marketplaceRepo({ source: { source: "git", url: "https://github.com/a/b.git" } }), "github.com/a/b");
  assert.equal(marketplaceRepo({ source: { source: "github", repo: "A/B" } }), "github.com/a/b");
  assert.equal(marketplaceRepo({ source: { source: "directory", path: "/x" } }), null);
  assert.equal(marketplaceRepo(null), null);
  assert.equal(marketplaceRepo("x"), null);
});

test("findSourceProject matches the first project with that remote; none gives null", () => {
  const projects = [
    { id: "p1", name: "bb", gitRemoteUrl: "git@github.com:kartollikaa/bb-plugins.git" },
    { id: "p2", name: "hub", gitRemoteUrl: "https://github.com/kartollikaa/kartollika-ai-hub" },
    { id: "p3", name: "hub copy", gitRemoteUrl: "https://github.com/kartollikaa/kartollika-ai-hub.git" },
    { id: "p4", name: "none", gitRemoteUrl: null },
  ];
  assert.equal(findSourceProject("github.com/kartollikaa/kartollika-ai-hub", projects)?.id, "p2");
  assert.equal(findSourceProject("github.com/x/y", projects), null);
  assert.equal(findSourceProject(null, projects), null);
});

test("brief for one role: values, source files, and the safety instructions", () => {
  const brief = proposalBrief({ role: roles.find((r) => r.name === "reviewer") ?? null, install, roles, generated: current });
  assert.match(brief, /^\[team-roles\] The owner wants to change the `team` plugin's `reviewer` role\./);
  assert.match(brief, /Installed: team 0\.2\.0 \(team@kartollika-ai-hub, commit 4451618\)\. Generated files: current\./);
  assert.match(brief, /plugins\/team\/roles\/reviewer\.md/);
  assert.match(brief, /plugins\/team\/codex\/agents\/team-reviewer\.toml/);
  assert.match(brief, /- claude-code: team:reviewer, opus \/ high; blocked tools Edit, Write, NotebookEdit, MultiEdit, Agent, WebFetch, WebSearch/);
  assert.match(brief, /- codex: team-reviewer, gpt-6\.1-sol \/ high; not enforced by the runtime: must not create, edit or delete files yourself/);
  assert.match(brief, /Never edit the installed copy under ~\/\.claude\/plugins\/cache/);
  assert.match(brief, /leave both to the owner/);
  assert.ok(!brief.includes("/Users/"));
});

test("brief for no role lists every role on one line", () => {
  const brief = proposalBrief({ role: null, install, roles, generated: { ...current, state: "stale", problems: ["stale: x"] } });
  assert.match(brief, /plugin's roles\./);
  assert.match(brief, /Generated files: stale\./);
  assert.match(brief, /plugins\/team\/roles\/<role>\.md/);
  for (const role of roles) assert.match(brief, new RegExp(`^- ${role.name}: claude-code `, "m"));
  assert.equal(brief.split("\n").filter((line) => line.startsWith("- reviewer:")).length, 1);
});

test("brief without an install or roles still renders", () => {
  const brief = proposalBrief({ role: null, install: null, roles: [], generated: current });
  assert.match(brief, /team plugin not found/);
  assert.match(brief, /roles\.json could not be read/);
});

test("the brief names the role's Codex agent file, not a guessed team-<role>", () => {
  const reviewer = roles.find((r) => r.name === "reviewer");
  const codex = reviewer?.runtimes["codex"];
  assert.ok(reviewer && codex);
  const renamed = { ...reviewer, runtimes: { ...reviewer.runtimes, codex: { ...codex, agent: "custom-agent" } } };
  const brief = proposalBrief({ role: renamed, install, roles, generated: current });
  assert.ok(brief.includes("codex/agents/custom-agent.toml"));
  assert.ok(!brief.includes("team-reviewer.toml"));
});
