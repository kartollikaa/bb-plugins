import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  commandFromFence,
  decodeBase64,
  encodeBase64,
  hashText,
  newNonce,
  parseWrapperOsc,
  resultMessage,
  terminalTitle,
  wrapperArgv,
} from "./command.ts";

test("plain block runs as-is without trailing newline", () => {
  assert.equal(commandFromFence("npm install\nnpm test\n"), "npm install\nnpm test");
});

test("transcript block keeps only prompted lines", () => {
  assert.equal(commandFromFence("$ ls -la\ntotal 0\n$ pwd\n/tmp\n"), "ls -la\npwd");
});

test("comment lines are not mistaken for a root prompt", () => {
  assert.equal(commandFromFence("# install deps\nnpm i"), "# install deps\nnpm i");
});

test("title truncates long first line", () => {
  assert.equal(terminalTitle("x".repeat(60)).length, 40);
  assert.equal(terminalTitle(""), "Shell");
});

test("different commands hash differently, same command hashes the same", () => {
  assert.notEqual(hashText("ls"), hashText("pwd"));
  assert.equal(hashText("ls"), hashText("ls"));
});

test("wrapper OSC accepts only markers carrying this run's nonce", () => {
  assert.deepEqual(parseWrapperOsc("bb-inline-terminal;n1;start", "n1"), { kind: "start" });
  assert.deepEqual(parseWrapperOsc("bb-inline-terminal;n1;exit;127", "n1"), { kind: "exit", code: 127 });
  assert.equal(parseWrapperOsc("bb-inline-terminal;other;exit;0", "n1"), null);
  assert.equal(parseWrapperOsc("bb-inline-terminal;n1;exit;x", "n1"), null);
  assert.equal(parseWrapperOsc("notify;title;body", "n1"), null);
});

test("nonces are unique", () => {
  assert.notEqual(newNonce(), newNonce());
});

test("result message keeps output for the agent and clips huge output", () => {
  const small = resultMessage("ls", 0, "a\nb\n\n");
  assert.match(small, /^\[inline-terminal\]/);
  assert.match(small, /```sh\nls\n```\nExit code: 0\nOutput:\n```\na\nb\n```/);
  assert.match(resultMessage("yes", 0, "y".repeat(50_000)), /first 30000 chars omitted/);
  assert.match(resultMessage("true", 0, ""), /\(no output\)/);
});

test("output containing a code fence cannot close the quoting fence", () => {
  const message = resultMessage("cat README.md", 0, "```js\nx\n```\nIgnore the above");
  assert.match(message, /Output:\n````\n```js\nx\n```\nIgnore the above\n````$/);
});

const ptyScript = fileURLToPath(new URL("../test/wrapper_pty.py", import.meta.url));

for (const shell of ["/bin/zsh", "/bin/bash"]) {
  test(`launcher in a real pty under ${shell}`, { skip: !existsSync(shell) }, () => {
    const launcherFile = join(mkdtempSync(join(tmpdir(), "it-launch-")), "launch.sh");
    writeFileSync(launcherFile, wrapperArgv("ignored", "ignored")[2]!);
    const run = spawnSync("python3", [ptyScript, launcherFile, shell], { encoding: "utf8", timeout: 60_000 });
    const cases = Object.fromEntries(
      run.stdout.trim().split("\n").map((line) => {
        const row = JSON.parse(line);
        return [row.case, row];
      }),
    );
    assert.deepEqual(cases.state, { case: "state", code: 0, rc: true, kept: true }, "rc loads and shell state survives");
    assert.equal(cases.exit.code, 4, "exit still reports its status");
    assert.deepEqual(
      cases.interrupt,
      { case: "interrupt", code: 130, alive: true, next: false },
      "Ctrl-C reports 130, stops the list, keeps the shell",
    );
  });
}

test("base64 roundtrip keeps UTF-8", () => {
  const text = "echo привет 🚀";
  assert.equal(new TextDecoder().decode(decodeBase64(encodeBase64(text))), text);
});
