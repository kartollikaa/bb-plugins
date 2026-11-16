import { z } from "zod";
import {
  rolesFileSchema,
  type CodexStatus,
  type GeneratedStatus,
  type PromptResult,
  type RoleRow,
  type RunResult,
  type RuntimeRow,
} from "./schema.ts";
import { shellQuote } from "./scripts.ts";

const MAX_LINE = 400;

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, MAX_LINE))
    .filter((line) => line !== "");
}

export function parseRolesJson(text: string | null): { roles: RoleRow[]; error: string | null } {
  if (text === null) return { roles: [], error: "roles.json can't be read" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { roles: [], error: "roles.json is not valid JSON" };
  }
  const version = z.object({ version: z.unknown() }).safeParse(json);
  if (version.success && version.data.version !== 1) {
    return { roles: [], error: `roles.json: version ${JSON.stringify(version.data.version) ?? "missing"} is not supported` };
  }
  const parsed = rolesFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { roles: [], error: `roles.json: ${issue?.path.join(".") || "root"}: ${issue?.message ?? "does not match the expected shape"}` };
  }
  const roles = Object.entries(parsed.data.roles)
    .map(([name, role]) => ({ name, ...role }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { roles, error: null };
}

const resolveSchema = z.object({
  agent: z.string(),
  model: z.string(),
  effort: z.string(),
  disallowed_tools: z.array(z.string()),
  features: z.record(z.string(), z.boolean()),
  unenforced: z.array(z.string()),
  prompt: z.string(),
});

export function differingFields(table: RuntimeRow, resolved: RuntimeRow): string[] {
  const fields = ["agent", "model", "effort", "disallowed_tools", "features", "unenforced"] as const;
  return fields.filter((field) => JSON.stringify(table[field]) !== JSON.stringify(resolved[field]));
}

export function parseResolve(result: RunResult, table: RuntimeRow | null): PromptResult {
  if (result.failure !== null) return { prompt: null, error: result.failure, differsFromTable: [] };
  if (result.exitCode !== 0) {
    const reason = lines(result.stderr).find((line) => line.startsWith("error:")) ?? `exit code ${result.exitCode}`;
    return { prompt: null, error: reason, differsFromTable: [] };
  }
  let json: unknown;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    return { prompt: null, error: "resolve printed something other than JSON", differsFromTable: [] };
  }
  const parsed = resolveSchema.safeParse(json);
  if (!parsed.success) return { prompt: null, error: "resolve printed JSON without the expected keys", differsFromTable: [] };
  return {
    prompt: parsed.data.prompt,
    error: null,
    differsFromTable: table === null ? [] : differingFields(table, parsed.data),
  };
}

const PROBLEM = /^(missing|stale|not produced by any role): (.+)$/;
const ADVICE = "run scripts/render_roles.py and commit the result";
const ERROR_LINE = /^error: (.+)$/;

function problemLines(all: string[]): string[] {
  return all.filter((line) => PROBLEM.test(line));
}

export function parseCheck(result: RunResult): GeneratedStatus {
  const unknown = (error: string, other: string[] = []): GeneratedStatus => ({ state: "unknown", problems: [], error, other });
  if (result.failure !== null) return unknown(result.failure);
  const stderr = lines(result.stderr);
  const stdout = lines(result.stdout);
  const problems = problemLines(stderr);
  const other = [...stdout, ...stderr.filter((line) => !PROBLEM.test(line) && line !== ADVICE && !ERROR_LINE.test(line))];
  if (result.exitCode === 0) return { state: "current", problems: [], error: null, other };
  if (result.exitCode === 1) {
    if (problems.length > 0) return { state: "stale", problems, error: null, other };
    const message = stderr.map((line) => ERROR_LINE.exec(line)?.[1]).find((value) => value !== undefined);
    if (message !== undefined) return { state: "invalid", problems: [], error: message, other };
    return unknown("--check failed without a reason", other);
  }
  return unknown(`--check exited with code ${result.exitCode}`, other);
}

const PLAN = /^(install|update|unchanged|remove|forget|conflict|keep)\s+(\S.*)$/;
const STALE_BLOCK = /generated files are not current/;

function dirnameOf(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : null;
}

const EMPTY: Omit<CodexStatus, "state"> = { dest: null, steps: [], message: null, problems: [], other: [], applyCommand: null };

export function parseCodexPlan(result: RunResult, root: string): CodexStatus {
  const unknown = (message: string, extra: Partial<CodexStatus> = {}): CodexStatus => ({ ...EMPTY, ...extra, state: "unknown", message });
  if (result.failure !== null) return unknown(result.failure);
  if (result.exitCode !== 0 && result.exitCode !== 1) return unknown(`the installer exited with code ${result.exitCode}`);

  const stdout = lines(result.stdout);
  const stderr = lines(result.stderr);
  const steps = stdout.flatMap((line) => {
    const match = PLAN.exec(line);
    return match === null ? [] : [{ action: match[1] ?? "", file: match[2] ?? "" }];
  });
  const errors = stderr.map((line) => ERROR_LINE.exec(line)?.[1]).filter((value): value is string => value !== undefined);
  const tolerated = (line: string) =>
    PLAN.test(line) ||
    line.startsWith("dry run:") ||
    line.startsWith("applied to ") ||
    line.includes("edited after install and no role produces them any more") ||
    line.includes("left alone, edited since install or not written by this script") ||
    PROBLEM.test(line) ||
    ERROR_LINE.test(line);
  const other = [...stdout, ...stderr].filter((line) => !tolerated(line));
  const applyCommand = `python3 ${shellQuote(`${root}/scripts/install_codex_agents.py`)} --apply`;
  const dest = steps[0] === undefined ? null : dirnameOf(steps[0].file);
  const base = { ...EMPTY, steps, dest, other };

  if (steps.length > 0) {
    const has = (action: string) => steps.some((step) => step.action === action);
    if (has("conflict")) {
      if (result.exitCode !== 1) return unknown("the installer reported a conflict but exited 0", base);
      return { ...base, state: "conflict", message: "edited since install; compare, then rerun with --force", applyCommand };
    }
    if (result.exitCode !== 0) return unknown("the installer exited 1 without naming a conflict or an error", base);
    if (steps.every((step) => step.action === "unchanged")) return { ...base, state: "installed" };
    if (steps.every((step) => step.action === "install")) return { ...base, state: "not-installed", applyCommand };
    return { ...base, state: "pending", applyCommand };
  }

  const blocked = errors.find((message) => STALE_BLOCK.test(message));
  if (blocked !== undefined) {
    return { ...base, state: "blocked", message: "generated files are not current", problems: problemLines(stderr) };
  }
  const first = errors[0];
  if (first !== undefined) return unknown(first, base);
  return unknown("the installer planned nothing", base);
}
