import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalUrl, classify, collectLinks, extractUrls, sortLinks, trimUrl } from "../lib/links.ts";
import { headline, parsePullRequest, statusChips, summarizeChecks } from "../lib/pull-request.ts";
import { ghConfigDirs, messageText } from "../server.ts";

const PR = "https://github.com/dodobrands/drinkit-mobile-android/pull/6977";

test("prose punctuation and unbalanced brackets stay out of the URL", () => {
  assert.equal(trimUrl("https://a.dev/x."), "https://a.dev/x");
  assert.equal(trimUrl("https://a.dev/x),"), "https://a.dev/x");
  assert.equal(trimUrl("https://en.wikipedia.org/wiki/Foo_(bar)"), "https://en.wikipedia.org/wiki/Foo_(bar)");
  assert.equal(trimUrl("https://a.dev/x**"), "https://a.dev/x");
});

test("markdown links keep their text as the label source", () => {
  assert.deepEqual(extractUrls("see [the spec](https://a.dev/spec) and <https://b.dev>"), [
    { url: "https://a.dev/spec", text: "the spec" },
    { url: "https://b.dev", text: null },
  ]);
  assert.deepEqual(extractUrls("[https://a.dev](https://a.dev)"), [
    { url: "https://a.dev", text: null },
    { url: "https://a.dev", text: null },
  ]);
});

test("a PR's tabs, fragments and tracking parameters are one link", () => {
  assert.equal(canonicalUrl(`${PR}/files#diff-1`), PR);
  assert.equal(canonicalUrl(`${PR}#issuecomment-5`), PR);
  assert.equal(canonicalUrl("https://a.dev/x/?utm_source=t&id=2#top"), "https://a.dev/x?id=2");
  assert.equal(canonicalUrl("ftp://a.dev/x"), null);
  assert.equal(canonicalUrl("https://"), null);
});

test("GitHub, Kaiten, Buildin and Figma links get their own kind and label", () => {
  assert.deepEqual(classify(PR), {
    kind: "pull-request",
    label: "drinkit-mobile-android #6977",
    host: "github.com",
    github: { owner: "dodobrands", repo: "drinkit-mobile-android", number: 6977 },
  });
  assert.equal(classify("https://github.com/o/r/issues/12").kind, "issue");
  assert.equal(classify("https://github.com/o/r/commit/5e16737e22a5").label, "r@5e16737");
  assert.equal(classify("https://github.com/o/r").label, "o/r");
  assert.equal(classify("https://dodopizza.kaiten.ru/space/1/card/55123456").label, "Kaiten 55123456");
  assert.equal(classify("https://buildin.ai/abc/Main-v4-spec-123").kind, "buildin");
  assert.equal(classify("https://www.figma.com/design/KEY/Main-v4?node-id=1-2").label, "Figma Main v4");
  assert.equal(classify("https://getbb.app/plugin-guide").label, "getbb.app/plugin-guide");
});

test("repeated mentions fold into one link and PRs sort first, latest mention leading", () => {
  const links = collectLinks([
    { seq: 1, text: `Install ${PR} please, docs at https://getbb.app/plugin-guide` },
    { seq: 5, text: `Done, see ${PR}/checks` },
    { seq: 7, text: "and [old PR](https://github.com/o/r/pull/1)" },
  ]);
  const pr = links.get(PR)!;
  assert.equal(pr.mentions, 2);
  assert.equal(pr.firstSeq, 1);
  assert.equal(pr.lastSeq, 5);
  assert.deepEqual(
    sortLinks(links.values()).map((link) => link.url),
    ["https://github.com/o/r/pull/1", PR, "https://getbb.app/plugin-guide"],
  );
});

test("only prompts and agent replies count, never system turns or tool output", () => {
  const prompt = { seq: 1, type: "client/turn/requested", data: { initiator: "user", input: [{ type: "text", text: PR }] } };
  const system = { seq: 2, type: "client/turn/requested", data: { initiator: "system", input: [{ type: "text", text: PR }] } };
  const reply = { seq: 3, type: "item/completed", data: { item: { type: "agentMessage", text: "ok" } } };
  const tool = { seq: 4, type: "item/completed", data: { item: { type: "commandExecution", aggregatedOutput: PR } } };
  assert.deepEqual([prompt, system, reply, tool].flatMap(messageText), [
    { seq: 1, text: PR },
    { seq: 3, text: "ok" },
  ]);
});

test("extra gh profiles are tried after the default login", () => {
  const root = mkdtempSync(join(tmpdir(), "gh-config-"));
  for (const name of ["gh", "gh-work", "gh-empty", "ghostty"]) mkdirSync(join(root, name));
  writeFileSync(join(root, "gh", "hosts.yml"), "");
  writeFileSync(join(root, "gh-work", "hosts.yml"), "");
  assert.deepEqual(ghConfigDirs(root), [null, join(root, "gh-work")]);
  assert.deepEqual(ghConfigDirs(join(root, "missing")), [null]);
});

const run = (name: string, status: string, conclusion: string, startedAt: string) => ({
  __typename: "CheckRun",
  workflowName: "CI",
  name,
  status,
  conclusion,
  startedAt,
});

test("a rerun replaces the older attempt of the same check", () => {
  const checks = summarizeChecks([
    run("tests", "COMPLETED", "FAILURE", "2026-11-02T10:00:00Z"),
    run("tests", "COMPLETED", "SUCCESS", "2026-11-02T11:00:00Z"),
    run("lint", "IN_PROGRESS", "", "2026-11-02T11:00:00Z"),
    run("ui", "COMPLETED", "CANCELLED", "2026-11-02T11:00:00Z"),
    run("detect", "COMPLETED", "SKIPPED", "2026-11-02T11:00:00Z"),
    { __typename: "StatusContext", context: "sonar", state: "SUCCESS", startedAt: "" },
  ]);
  assert.deepEqual(checks, { passed: 2, failed: 1, pending: 1, skipped: 1, failedNames: ["ui"] });
});

const raw = {
  number: 6977,
  title: "Main v4 US2",
  url: PR,
  state: "OPEN",
  isDraft: false,
  reviewDecision: "CHANGES_REQUESTED",
  latestReviews: [
    { author: { login: "makzimi" }, state: "APPROVED" },
    { author: { login: "dodo-mobile" }, state: "CHANGES_REQUESTED" },
  ],
  reviewRequests: [{ login: "alice" }, { slug: "android-team" }],
  mergeable: "MERGEABLE",
  mergeStateStatus: "BLOCKED",
  autoMergeRequest: { enabledAt: "2026-11-02T11:00:00Z" },
  statusCheckRollup: [run("tests", "COMPLETED", "FAILURE", "2026-11-02T11:00:00Z")],
  additions: 116,
  deletions: 20,
  baseRefName: "develop",
  headRefName: "feature/x",
};

test("every status a person acts on becomes a chip, in reading order", () => {
  const pr = parsePullRequest(raw);
  assert.deepEqual(
    statusChips(pr).map((chip) => chip.detail ? `${chip.text}: ${chip.detail}` : chip.text),
    [
      "Open",
      "Changes requested: dodo-mobile",
      "Approved: makzimi",
      "Awaiting review: alice, android-team",
      "1 check failed: tests",
      "Merge blocked",
      "Auto-merge on",
      "+116 −20",
    ],
  );
  assert.equal(headline(pr).text, "Checks failed");
});

test("the headline names what the PR waits on most urgently", () => {
  const conflicted = parsePullRequest({ ...raw, mergeable: "CONFLICTING" });
  assert.equal(headline(conflicted).text, "Conflicts");
  const merged = parsePullRequest({ ...raw, state: "MERGED" });
  assert.equal(headline(merged).text, "Merged");
  assert.equal(merged.merge, null);
  assert.deepEqual(statusChips(merged).map((chip) => chip.text), ["Merged", "1 check failed", "+116 −20"]);
  const ready = parsePullRequest({
    ...raw,
    reviewDecision: "APPROVED",
    latestReviews: [],
    reviewRequests: [],
    mergeStateStatus: "CLEAN",
    autoMergeRequest: null,
    statusCheckRollup: [],
  });
  assert.equal(headline(ready).text, "Ready to merge");
  const draft = parsePullRequest({ ...raw, isDraft: true, statusCheckRollup: [], reviewDecision: "", latestReviews: [] });
  assert.equal(draft.state, "draft");
  assert.equal(headline(draft).text, "Draft");
});
