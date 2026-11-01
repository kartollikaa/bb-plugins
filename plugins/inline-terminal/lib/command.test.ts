import assert from "node:assert/strict";
import { test } from "node:test";
import { commandFromFence, decodeBase64, encodeBase64, shellInput, terminalTitle } from "./command.ts";

test("plain block runs as-is without trailing newline", () => {
  assert.equal(commandFromFence("npm install\nnpm test\n"), "npm install\nnpm test");
});

test("transcript block keeps only prompted lines", () => {
  assert.equal(commandFromFence("$ ls -la\ntotal 0\n$ pwd\n/tmp\n"), "ls -la\npwd");
});

test("comment lines are not mistaken for a root prompt", () => {
  assert.equal(commandFromFence("# install deps\nnpm i"), "# install deps\nnpm i");
});

test("multi-line input is bracketed-pasted, single line is typed", () => {
  assert.equal(shellInput("ls"), "ls\r");
  assert.equal(shellInput("a\nb"), "\x1b[200~a\nb\x1b[201~\r");
});

test("title truncates long first line", () => {
  assert.equal(terminalTitle("x".repeat(60)).length, 40);
  assert.equal(terminalTitle(""), "Shell");
});

test("base64 roundtrip keeps UTF-8", () => {
  const text = "echo привет 🚀";
  assert.equal(new TextDecoder().decode(decodeBase64(encodeBase64(text))), text);
});
