import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  GITHUB_QUERY,
  applyPatch,
  buildFolder,
  mergeAccounts,
  parseSearch,
  pruneSnoozed,
  readSettings,
  setSnoozed,
  settingsPatchSchema,
  snoozeKey,
  type FolderSettings,
  type GithubPr,
} from "../lib/github.ts";

function node(number: number, extra: Record<string, unknown> = {}) {
  return {
    url: `https://github.com/acme/app/pull/${number}`,
    number,
    title: `PR ${number}`,
    isDraft: false,
    updatedAt: `2026-11-0${number}T10:00:00Z`,
    reviewDecision: null,
    mergeable: "MERGEABLE",
    author: { login: "someone" },
    repository: { nameWithOwner: "acme/app", owner: { login: "acme" } },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
    ...extra,
  };
}

function pr(overrides: Partial<GithubPr>): GithubPr {
  return {
    url: "https://github.com/acme/app/pull/1",
    number: 1,
    title: "PR",
    repo: "acme/app",
    owner: "acme",
    author: "me",
    isDraft: false,
    updatedAt: "2026-11-01T10:00:00Z",
    review: null,
    ci: "passed",
    conflicts: false,
    sources: ["author"],
    teamReview: false,
    ...overrides,
  };
}

const SETTINGS = DEFAULT_SETTINGS;
const DEFAULT_SOURCES = DEFAULT_SETTINGS.sources;

test("the query searches every source in one call", () => {
  for (const alias of ["review:", "userReview:", "author:", "assigned:", "mentioned:", "viewer"]) {
    assert.ok(GITHUB_QUERY.includes(alias), alias);
  }
});

test("a search response folds into one PR per url with its sources", () => {
  const { login, prs } = parseSearch({
    viewer: { login: "me" },
    review: { nodes: [node(1), node(2)] },
    userReview: { nodes: [node(1)] },
    author: { nodes: [node(3, { author: { login: "me" }, reviewDecision: "CHANGES_REQUESTED", mergeable: "CONFLICTING" })] },
    assigned: { nodes: [node(1), {}] },
    mentioned: { nodes: [] },
  });
  assert.equal(login, "me");
  assert.deepEqual(
    prs.map((item) => [item.number, item.sources, item.teamReview]),
    [
      [1, ["review", "assigned"], false],
      [2, ["review"], true],
      [3, ["author"], false],
    ],
  );
  const mine = prs.find((item) => item.number === 3)!;
  assert.equal(mine.review, "changes_requested");
  assert.equal(mine.conflicts, true);
  assert.equal(mine.ci, "passed");
  assert.equal(mine.repo, "acme/app");
});

test("CI state comes from the last commit's rollup", () => {
  const ci = (state: string | null) =>
    parseSearch({
      author: { nodes: [node(1, { commits: { nodes: [{ commit: { statusCheckRollup: state ? { state } : null } }] } })] },
    }).prs[0]!.ci;
  assert.equal(ci("FAILURE"), "failed");
  assert.equal(ci("ERROR"), "failed");
  assert.equal(ci("PENDING"), "pending");
  assert.equal(ci("SUCCESS"), "passed");
  assert.equal(ci(null), null);
});

test("accounts that see the same PR merge it, keeping a personal review request", () => {
  const [merged] = mergeAccounts([
    [pr({ sources: ["review"], teamReview: true })],
    [pr({ sources: ["review", "mentioned"], teamReview: false })],
  ]);
  assert.deepEqual(merged!.sources, ["review", "mentioned"]);
  assert.equal(merged!.teamReview, false);
});

test("my PRs show only when they wait on me, unless all of them are asked for", () => {
  const prs = [
    pr({ url: "u/quiet", review: "review_required" }),
    pr({ url: "u/changes", review: "changes_requested" }),
    pr({ url: "u/ci", ci: "failed" }),
    pr({ url: "u/ready", review: "approved" }),
    pr({ url: "u/approved-but-running", review: "approved", ci: "pending" }),
  ];
  const attention = buildFolder(prs, SETTINGS);
  assert.deepEqual(
    attention.items.map((item) => [item.pr.url, item.attention]),
    [
      ["u/changes", ["changes_requested"]],
      ["u/ci", ["ci_failed"]],
      ["u/ready", ["ready"]],
    ],
  );
  const all = buildFolder(prs, { ...SETTINGS, myPrs: "all" });
  assert.equal(all.items.length, 5);
  assert.deepEqual(all.items.at(-1)!.attention, []);
});

test("review requests come first, then newest", () => {
  const folder = buildFolder(
    [
      pr({ url: "u/mine", ci: "failed", updatedAt: "2026-11-03T00:00:00Z" }),
      pr({ url: "u/old-review", sources: ["review"], updatedAt: "2026-10-01T00:00:00Z" }),
      pr({ url: "u/new-review", sources: ["review"], updatedAt: "2026-11-02T00:00:00Z" }),
    ],
    SETTINGS,
  );
  assert.deepEqual(
    folder.items.map((item) => item.pr.url),
    ["u/new-review", "u/old-review", "u/mine"],
  );
});

test("filters: sources, team reviews, drafts, orgs, snoozed PRs", () => {
  const review = pr({ url: "u/review", sources: ["review"], teamReview: true });
  const draft = pr({ url: "u/draft", sources: ["review"], isDraft: true });
  const other = pr({ url: "u/other", owner: "other", sources: ["review"] });
  const assignedMine = pr({ url: "u/assigned-mine", sources: ["author", "assigned"] });
  const all = [review, draft, other, assignedMine];
  const urls = (settings: Partial<FolderSettings>) =>
    buildFolder(all, { ...SETTINGS, ...settings }).items.map((item) => item.pr.url);

  assert.deepEqual(urls({}), ["u/review", "u/draft", "u/other"]);
  assert.deepEqual(urls({ teamReviews: false }), ["u/draft", "u/other"]);
  assert.deepEqual(urls({ drafts: false }), ["u/review", "u/other"]);
  assert.deepEqual(urls({ hiddenOrgs: ["other"] }), ["u/review", "u/draft"]);
  assert.deepEqual(urls({ sources: { ...DEFAULT_SOURCES, review: false } }), []);

  const snoozed = buildFolder(all, { ...SETTINGS, snoozed: [snoozeKey(review)] });
  assert.deepEqual(snoozed.snoozed.map((item) => item.pr.url), ["u/review"]);
  const updated = buildFolder([{ ...review, updatedAt: "2026-12-01T00:00:00Z" }], {
    ...SETTINGS,
    snoozed: [snoozeKey(review)],
  });
  assert.equal(updated.items.length, 1);

  assert.deepEqual(buildFolder(all, SETTINGS).orgs, ["acme", "other"]);
});

test("stored settings fall back per field and patches merge sources", () => {
  assert.deepEqual(readSettings(undefined), DEFAULT_SETTINGS);
  const read = readSettings({ myPrs: "all", drafts: "yes", sources: { mentioned: true } });
  assert.equal(read.myPrs, "all");
  assert.equal(read.drafts, true);
  assert.deepEqual(read.sources, { ...DEFAULT_SETTINGS.sources, mentioned: true });

  const patch = settingsPatchSchema.parse({ sources: { review: false }, hiddenOrgs: ["acme"] });
  const next = applyPatch(DEFAULT_SETTINGS, patch);
  assert.deepEqual(next.sources, { ...DEFAULT_SETTINGS.sources, review: false });
  assert.deepEqual(next.hiddenOrgs, ["acme"]);
  assert.throws(() => settingsPatchSchema.parse({ snoozed: [] }));
});

test("snoozes toggle and drop once the PR changes or closes", () => {
  const live = pr({ url: "u/live" });
  const key = snoozeKey(live);
  const on = setSnoozed(DEFAULT_SETTINGS, key, true);
  assert.deepEqual(setSnoozed(on, key, true).snoozed, [key]);
  assert.deepEqual(setSnoozed(on, key, false).snoozed, []);
  const withStale = { ...on, snoozed: [key, "u/gone@2026-01-01T00:00:00Z"] };
  assert.deepEqual(pruneSnoozed(withStale, [live]).snoozed, [key]);
  assert.equal(pruneSnoozed(on, [live]), on);
});
