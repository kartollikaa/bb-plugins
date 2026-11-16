import { test } from "node:test";
import assert from "node:assert/strict";
import { firstLine, spokenText } from "../src/text.ts";

test("last words drop bb directives and fenced blocks", () => {
  const report = '::browser-preview{session="abc"}\n```ui\nCard("x", [Button("y")])\n```\nStarted D3 on the timeline ::browser-preview{session="abc"}\n~~~\nlog\n~~~';
  assert.equal(firstLine(report), "Started D3 on the timeline");
  assert.doesNotMatch(spokenText(report), /::|```|~~~|Button|log/);
  assert.equal(spokenText("Open fence\n```sh\nnever closed"), "Open fence\n");
});
