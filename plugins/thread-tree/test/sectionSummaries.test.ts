import { test } from "node:test";
import assert from "node:assert/strict";
import type { AutomationSummary } from "../src/automations.ts";
import type { GithubFolderItem } from "../src/githubFolder.ts";
import { linkedThreadByUrl } from "../src/needsYou.ts";
import {
  automationsSummary,
  isSectionCollapsed,
  pullRequestSummary,
  pullRequestLook,
  sectionToggleKey,
} from "../src/sectionSummaries.ts";

function pr(number: number, attention: GithubFolderItem["attention"], isDraft = false): GithubFolderItem {
  return {
    pr: { url: `https://github.com/o/r/pull/${number}`, number, title: `PR ${number}`, repo: "o/r", author: "me", isDraft, updatedAt: "2026-11-14T00:00:00Z" },
    attention,
    snoozeKey: `k${number}`,
  };
}

function automation(over: Partial<AutomationSummary>): AutomationSummary {
  return {
    id: over.name ?? "a",
    projectId: "p",
    projectName: null,
    name: "a",
    enabled: true,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: "succeeded",
    lastRunThreadId: null,
    lastError: null,
    ...over,
  };
}

test("PR and Automations start collapsed; other sections start open", () => {
  assert.equal(isSectionCollapsed(new Set(), "github"), true);
  assert.equal(isSectionCollapsed(new Set(), "automations"), true);
  assert.equal(isSectionCollapsed(new Set(), "recent"), false);
  assert.equal(isSectionCollapsed(new Set([sectionToggleKey("github")]), "github"), false);
  assert.equal(isSectionCollapsed(new Set([sectionToggleKey("recent")]), "recent"), true);
});

test("a stored collapse from before v2 does not keep PR open or closed by accident", () => {
  assert.equal(isSectionCollapsed(new Set(["github"]), "github"), true);
  assert.notEqual(sectionToggleKey("github"), "github");
  assert.equal(sectionToggleKey("recent"), "recent");
});

test("PR summary leads with the problems, then the total", () => {
  const items = [pr(1, ["ci_failed"]), pr(2, ["conflicts", "ci_failed"]), pr(3, ["review"]), pr(4, []), pr(5, ["changes_requested"])];
  assert.deepEqual(pullRequestSummary(items), [
    { text: "2 failing", tone: "bad" },
    { text: "1 conflicts", tone: "bad" },
    { text: "1 changes", tone: "bad" },
    { text: "5", tone: "muted" },
  ]);
});

test("a calm PR summary is the count alone", () => {
  assert.deepEqual(pullRequestSummary([pr(1, ["review"]), pr(2, ["ready"])]), [{ text: "2", tone: "muted" }]);
  assert.deepEqual(pullRequestSummary([]), [{ text: "0", tone: "muted" }]);
});

test("a PR row's glyph is its most urgent reason, whatever order GitHub Folder lists them in", () => {
  assert.equal(pullRequestLook(pr(1, ["review", "ci_failed"])).reason, "ci_failed");
  assert.equal(pullRequestLook(pr(1, ["ready", "conflicts"])).reason, "conflicts");
  assert.equal(pullRequestLook(pr(1, ["mentioned", "review"])).reason, "review");
  assert.equal(pullRequestLook(pr(1, ["ci_failed"])).label, "Checks failing");
});

test("a PR without a reason keeps a plain PR glyph, drafts their own", () => {
  assert.deepEqual(
    [pullRequestLook(pr(1, [])), pullRequestLook(pr(2, [], true))].map(({ reason, icon }) => ({ reason, icon })),
    [
      { reason: null, icon: "GitPullRequest" },
      { reason: null, icon: "GitPullRequestDraft" },
    ],
  );
});

test("the PR row's glyph matches the thread row's icon for the same reason", () => {
  const thread = pullRequestLook(pr(1, ["changes_requested"]));
  assert.equal(thread.label, "Changes requested");
  assert.match(thread.className, /amber/);
});

test("Automations summary: failures, live runs, then the soonest next run", () => {
  const now = 1_000_000;
  const list = [
    automation({ name: "a", lastRunStatus: "failed", nextRunAt: now + 30 * 60_000 }),
    automation({ name: "b", nextRunAt: now + 12 * 60_000 }),
    automation({ name: "c", lastRunStatus: "running" }),
    automation({ name: "d", enabled: false, lastRunStatus: "failed", nextRunAt: now + 60_000 }),
  ];
  assert.deepEqual(automationsSummary(list, now), [
    { text: "1 failed", tone: "bad" },
    { text: "1 running", tone: "muted" },
    { text: "next in 12m", tone: "muted" },
  ]);
});

test("Automations summary: a due run reads as due, and nothing scheduled falls back to the active count", () => {
  const now = 1_000_000;
  assert.deepEqual(automationsSummary([automation({ nextRunAt: now - 1 })], now), [{ text: "due now", tone: "muted" }]);
  assert.deepEqual(automationsSummary([automation({}), automation({ name: "b" }), automation({ name: "p", enabled: false })], now), [
    { text: "2", tone: "muted" },
  ]);
});

test("a PR URL links to the first thread that has it, case-insensitively", () => {
  const url = "https://github.com/o/r/pull/1";
  const linked = linkedThreadByUrl([
    { threadId: "t1", pullRequests: [{ url } as never] },
    { threadId: "t2", pullRequests: [{ url: url.toUpperCase() } as never] },
  ]);
  assert.equal(linked.get(url.toLowerCase()), "t1");
});

test("a PR row's icon label and tooltip name the reason with the same words", () => {
  assert.equal(pullRequestLook(pr(1, ["ready"])).label, "Approved, ready to merge");
});

test("a paused automation that is mid-run counts as running in the header, as its dot shows", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const paused = automation({ name: "p", enabled: false, lastRunStatus: "running" });
  assert.equal(automationsSummary([paused], now).some((part) => part.text === "1 running"), true);
});
