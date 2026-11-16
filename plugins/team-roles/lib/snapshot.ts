import { parseCheck, parseCodexPlan, parseRolesJson } from "./parse.ts";
import type { CodexStatus, GeneratedStatus, InstallInfo, RunResult, Snapshot } from "./schema.ts";
import type { Located } from "./locate.ts";
import type { ScriptCall } from "./scripts.ts";

export type SnapshotDeps = {
  locate(): Promise<Located>;
  readText(path: string): Promise<string | null>;
  run(root: string, call: ScriptCall): Promise<RunResult>;
  hostId(): Promise<string | null>;
  now(): number;
};

const noInstall = (reason: string): { generated: GeneratedStatus; codex: CodexStatus } => ({
  generated: { state: "unknown", problems: [], error: reason, other: [] },
  codex: { state: "unknown", dest: null, steps: [], message: reason, problems: [], other: [], applyCommand: null },
});

/** Never throws: every failed part is a named state and the rest still fills in. */
export async function buildSnapshot(deps: SnapshotDeps): Promise<Snapshot> {
  const checkedAt = deps.now();
  const hostId = await deps.hostId().catch(() => null);
  let located: Located;
  try {
    located = await deps.locate();
  } catch (error) {
    located = { error: `can't look for the team plugin: ${error instanceof Error ? error.message : String(error)}` };
  }
  if ("error" in located) {
    return { install: null, installError: located.error, roles: [], rolesError: null, ...noInstall(located.error), hostId, checkedAt };
  }
  const install: InstallInfo = located;
  const guard = async (call: ScriptCall): Promise<RunResult> => {
    try {
      return await deps.run(install.root, call);
    } catch (error) {
      return { exitCode: null, stdout: "", stderr: "", failure: error instanceof Error ? error.message : String(error) };
    }
  };
  const [text, check, plan] = await Promise.all([
    deps.readText(`${install.root}/roles.json`).catch(() => null),
    guard({ kind: "check" }),
    guard({ kind: "codex-plan" }),
  ]);
  const { roles, error } = parseRolesJson(text);
  return {
    install,
    installError: null,
    roles,
    rolesError: error,
    generated: parseCheck(check),
    codex: parseCodexPlan(plan, install.root),
    hostId,
    checkedAt,
  };
}
