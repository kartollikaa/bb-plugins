import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { findSourceProject, marketplaceRepo, proposalBrief } from "./lib/brief.ts";
import { createStampedCache } from "./lib/cache.ts";
import { rpcContract, SNAPSHOT_TAG } from "./lib/contract.ts";
import { findTeamInstall, marketplaceOf, type LocateDeps } from "./lib/locate.ts";
import { parseResolve } from "./lib/parse.ts";
import type { PromptResult, RunResult, Snapshot } from "./lib/schema.ts";
import { SCRIPT_MAX_BUFFER, SCRIPT_TIMEOUT_MS, classifyExecResult, scriptArgv, type ScriptCall } from "./lib/scripts.ts";
import { buildSnapshot } from "./lib/snapshot.ts";
import { formatList, generatedFiles } from "./lib/view.ts";

function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function mtime(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

function exec(root: string, call: ScriptCall): Promise<RunResult> {
  const argv = scriptArgv(root, call);
  return new Promise((resolve) => {
    execFile(
      "python3",
      argv,
      { cwd: tmpdir(), timeout: SCRIPT_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: SCRIPT_MAX_BUFFER, env: process.env, encoding: "utf8" },
      (error, stdout, stderr) => resolve(classifyExecResult(error, stdout, stderr)),
    );
  });
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    teamRoot: {
      type: "string",
      label: "Team plugin folder",
      default: "",
      description:
        "Leave empty to use the installed plugin. Set a folder such as a source checkout of plugins/team to read that instead.",
    },
  });

  const runs = createStampedCache<RunResult>();
  const snapshots = createStampedCache<Snapshot>();
  bb.onDispose(() => {
    runs.clear();
    snapshots.clear();
  });

  async function locateDeps(): Promise<LocateDeps> {
    const { teamRoot } = await settings.get();
    return { claudeDir: claudeDir(), settingRoot: teamRoot, readJson, isFile, listDir };
  }

  async function stamp(root: string | null): Promise<string> {
    const { teamRoot } = await settings.get();
    const home = process.env.CODEX_HOME || join(homedir(), ".codex");
    const times = await Promise.all([
      mtime(join(claudeDir(), "plugins", "installed_plugins.json")),
      root === null ? 0 : mtime(join(root, "roles.json")),
      mtime(join(home, "agents", ".team-agents.json")),
    ]);
    return [teamRoot, ...times].join("|");
  }

  async function currentRoot(): Promise<string | null> {
    const located = await findTeamInstall(await locateDeps());
    return "error" in located ? null : located.root;
  }

  async function snapshot(force: boolean): Promise<Snapshot> {
    if (force) {
      runs.clear();
      snapshots.clear();
    }
    const root = await currentRoot();
    const key = await stamp(root);
    return snapshots.get("snapshot", key, () =>
      buildSnapshot({
        locate: async () => findTeamInstall(await locateDeps()),
        readText,
        run: (installRoot, call) => runs.get(`${installRoot}:${JSON.stringify(call)}`, key, () => exec(installRoot, call)),
        hostId: async () => (await bb.sdk.system.config()).primaryHostId ?? null,
        now: () => Date.now(),
      }),
    );
  }

  async function requireRole(name: string) {
    const current = await snapshot(false);
    const role = current.roles.find((candidate) => candidate.name === name);
    if (role === undefined) {
      throw new Error(`No role ${name} in team ${current.install?.version ?? "(not installed)"}`);
    }
    return { current, role };
  }

  async function proposalContext() {
    const current = await snapshot(false);
    const key = current.install?.key ?? null;
    const marketplace = marketplaceOf(key);
    const known = marketplace === null ? null : ((await readJson(join(claudeDir(), "plugins", "known_marketplaces.json"))) as Record<string, unknown> | null)?.[marketplace];
    const repo = marketplaceRepo(known);
    const projects = (await bb.sdk.projects.list()).map((project) => ({
      id: project.id,
      name: project.name,
      gitRemoteUrl: project.gitRemoteUrl ?? null,
    }));
    return { current, repo, project: findSourceProject(repo, projects) };
  }

  bb.rpc.register(rpcContract, {
    snapshot: () => snapshot(false),
    refresh: async () => {
      const next = await snapshot(true);
      bb.rpc.experimental_invalidate([SNAPSHOT_TAG]);
      return next;
    },
    role: async ({ name }) => {
      const { role } = await requireRole(name);
      return { ...role, generatedFiles: generatedFiles(role) };
    },
    prompt: async ({ name, runtime }): Promise<PromptResult> => {
      const { current, role } = await requireRole(name);
      const table = role.runtimes[runtime];
      if (table === undefined || current.install === null) {
        return { prompt: null, error: `No runtime ${runtime} for ${name}`, differsFromTable: [] };
      }
      const call: ScriptCall = { kind: "resolve", role: name, runtime };
      const root = current.install.root;
      const key = await stamp(root);
      const result = await runs.get(`${root}:${JSON.stringify(call)}`, key, () => exec(root, call));
      return parseResolve(result, table);
    },
    proposal: async ({ role }) => {
      const { current, repo, project } = await proposalContext();
      const row = role === null ? null : (current.roles.find((candidate) => candidate.name === role) ?? null);
      if (role !== null && row === null) throw new Error(`No role ${role} in team ${current.install?.version ?? "(not installed)"}`);
      return {
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        repo: repo ?? null,
        brief: proposalBrief({ role: row, install: current.install, roles: current.roles, generated: current.generated }),
      };
    },
  });

  const usage = "Usage: bb team-roles list [--json]";
  bb.cli.register({
    name: "team-roles",
    summary: "Show the team plugin's agent roles",
    commands: [
      {
        name: "list",
        summary: "List roles with model and effort per runtime, plus generated-file and Codex status",
        usage: "bb team-roles list [--json]",
      },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const [command] = argv.filter((arg) => arg !== "--json");
      if (command !== "list") {
        return { exitCode: command === undefined || command === "help" || command === "--help" ? 0 : 1, stdout: usage };
      }
      const current = await snapshot(false);
      const ok = current.install !== null && current.rolesError === null;
      const output = json ? JSON.stringify(current) : formatList(current, homedir());
      return ok ? { exitCode: 0, stdout: output } : { exitCode: 1, stdout: json ? output : undefined, stderr: current.installError ?? current.rolesError ?? "team plugin not found" };
    },
  });
}
