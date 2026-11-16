import assert from "node:assert/strict";
import { test } from "node:test";
import { SCRIPT_TIMEOUT_MS, assertReadOnlyArgv, classifyExecResult, scriptArgv, shellQuote, type ScriptCall } from "../lib/scripts.ts";

const ROOT = "/t/0.2.0";
const WRITING = ["--apply", "--force", "--write", "-w"];

test("each call kind builds one fixed read-only argv", () => {
  assert.deepEqual(scriptArgv(ROOT, { kind: "resolve", role: "reviewer", runtime: "codex" }), [
    "-B", "-I", `${ROOT}/scripts/render_roles.py`, "resolve", "reviewer", "--runtime", "codex",
  ]);
  assert.deepEqual(scriptArgv(ROOT, { kind: "check" }), ["-B", "-I", `${ROOT}/scripts/render_roles.py`, "--check"]);
  assert.deepEqual(scriptArgv(ROOT, { kind: "codex-plan" }), ["-B", "-I", `${ROOT}/scripts/install_codex_agents.py`]);
});

test("no argv for any call kind carries a writing flag, and render_roles always has a read mode", () => {
  const calls: ScriptCall[] = [{ kind: "resolve", role: "a-b", runtime: "claude-code" }, { kind: "check" }, { kind: "codex-plan" }];
  for (const call of calls) {
    const argv = scriptArgv(ROOT, call);
    for (const flag of WRITING) assert.ok(!argv.includes(flag), `${call.kind} must not carry ${flag}`);
    if (argv[2]?.endsWith("render_roles.py")) assert.ok(argv[3] === "resolve" || argv[3] === "--check");
  }
});

test("invalid role and runtime names are refused before an argv exists", () => {
  for (const role of ["", "Reviewer", "../x", "a b", "a;rm", "-x", "--check", "a\n", "r1"]) {
    assert.throws(() => scriptArgv(ROOT, { kind: "resolve", role, runtime: "codex" }), /refused/, role);
  }
  for (const runtime of ["", "Codex", "x y", "../c", "-c", "a;b"]) {
    assert.throws(() => scriptArgv(ROOT, { kind: "resolve", role: "reviewer", runtime }), /refused/, runtime);
  }
});

test("the guard rejects every writing spelling (control: the matcher can say no)", () => {
  const render = `${ROOT}/scripts/render_roles.py`;
  const installer = `${ROOT}/scripts/install_codex_agents.py`;
  const writing = [
    ["-B", "-I", render],
    ["-B", "-I", render, "--write"],
    ["-B", "-I", render, "resolve"],
    ["-B", "-I", render, "resolve", "reviewer"],
    ["-B", "-I", render, "resolve", "reviewer", "--runtime", "codex", "--apply"],
    ["-B", "-I", render, "--check", "extra"],
    ["-B", "-I", installer, "--apply"],
    ["-B", "-I", installer, "--force"],
    ["-B", "-I", installer, "--dest", "/tmp/x"],
    ["-I", installer],
    ["-B", installer],
    ["-B", "-I", `${ROOT}/scripts/other.py`],
    ["-B", "-I", "-c", "print(1)"],
  ];
  for (const argv of writing) assert.throws(() => assertReadOnlyArgv(argv), /refused/, argv.join(" "));
  assert.doesNotThrow(() => assertReadOnlyArgv(["-B", "-I", installer]));
  assert.doesNotThrow(() => assertReadOnlyArgv(["-B", "-I", render, "--check"]));
});

test("exec results become values or named reasons", () => {
  assert.deepEqual(classifyExecResult(null, "o", "e"), { exitCode: 0, stdout: "o", stderr: "e", failure: null });
  assert.equal(classifyExecResult({ code: 1, stdout: "a", stderr: "b" }, "", "").exitCode, 1);
  assert.equal(classifyExecResult({ code: "ENOENT" }, "", "").failure, "python3 not found");
  assert.equal(classifyExecResult({ killed: true, signal: "SIGKILL" }, "", "").failure, `timed out after ${SCRIPT_TIMEOUT_MS / 1000} s`);
  assert.equal(classifyExecResult({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }, "", "").failure, "output too large");
  assert.match(classifyExecResult({ code: "EACCES" }, "", "").failure ?? "", /EACCES/);
});

test("shellQuote leaves safe paths and quotes the rest", () => {
  assert.equal(shellQuote("/a/b-c/d.py"), "/a/b-c/d.py");
  assert.equal(shellQuote("/a b/it's"), `'/a b/it'\\''s'`);
});
