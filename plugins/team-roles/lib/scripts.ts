import { ROLE_NAME, RUNTIME_NAME, type RunResult } from "./schema.ts";

export type ScriptCall =
  | { kind: "resolve"; role: string; runtime: string }
  | { kind: "check" }
  | { kind: "codex-plan" };

export const SCRIPT_TIMEOUT_MS = 10_000;
export const SCRIPT_MAX_BUFFER = 2 * 1024 * 1024;

const RENDER = "render_roles.py";
const INSTALLER = "install_codex_agents.py";

/** The one place that decides what may run: a read-only mode of a team script, never a writing one. */
export function assertReadOnlyArgv(argv: readonly string[]): void {
  const [bytecode, isolated, script, ...rest] = argv;
  if (bytecode !== "-B" || isolated !== "-I") throw new Error("refused: python must run with -B -I");
  const file = script?.split("/").pop();
  if (file === RENDER) {
    const [mode, role, flag, runtime, ...extra] = rest;
    if (mode === "--check" && role === undefined) return;
    if (mode === "resolve" && flag === "--runtime" && role !== undefined && ROLE_NAME.test(role) && runtime !== undefined && RUNTIME_NAME.test(runtime) && extra.length === 0) return;
    throw new Error(`refused: ${RENDER} is only run as "resolve <role> --runtime <runtime>" or "--check"`);
  }
  if (file === INSTALLER) {
    if (rest.length === 0) return;
    throw new Error(`refused: ${INSTALLER} is only run as a dry run, without arguments`);
  }
  throw new Error("refused: not a team script");
}

export function scriptArgv(root: string, call: ScriptCall): string[] {
  const prefix = ["-B", "-I"];
  let argv: string[];
  switch (call.kind) {
    case "resolve":
      if (!ROLE_NAME.test(call.role)) throw new Error(`refused: bad role name`);
      if (!RUNTIME_NAME.test(call.runtime)) throw new Error(`refused: bad runtime name`);
      argv = [...prefix, `${root}/scripts/${RENDER}`, "resolve", call.role, "--runtime", call.runtime];
      break;
    case "check":
      argv = [...prefix, `${root}/scripts/${RENDER}`, "--check"];
      break;
    case "codex-plan":
      argv = [...prefix, `${root}/scripts/${INSTALLER}`];
      break;
  }
  assertReadOnlyArgv(argv);
  return argv;
}

type ExecError = { code?: unknown; killed?: boolean; signal?: unknown; stdout?: unknown; stderr?: unknown };

/** Maps what `execFile` reports into a result; a failure that is not a script exit becomes a named reason. */
export function classifyExecResult(error: ExecError | null, stdout: string, stderr: string): RunResult {
  if (error === null) return { exitCode: 0, stdout, stderr, failure: null };
  const out = typeof error.stdout === "string" ? error.stdout : stdout;
  const err = typeof error.stderr === "string" ? error.stderr : stderr;
  if (error.code === "ENOENT") return { exitCode: null, stdout: out, stderr: err, failure: "python3 not found" };
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return { exitCode: null, stdout: "", stderr: "", failure: "output too large" };
  if (error.killed === true || error.signal !== null && error.signal !== undefined) {
    return { exitCode: null, stdout: out, stderr: err, failure: `timed out after ${SCRIPT_TIMEOUT_MS / 1000} s` };
  }
  if (typeof error.code === "number") return { exitCode: error.code, stdout: out, stderr: err, failure: null };
  return { exitCode: null, stdout: out, stderr: err, failure: `could not run python3 (${String(error.code ?? "unknown error")})` };
}

export function shellQuote(value: string): string {
  return /^[\w@%+=:,./~-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}
