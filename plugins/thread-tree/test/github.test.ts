import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SOURCES,
  GITHUB_QUERY,
  buildFolder,
  hideKey,
  mergeAccounts,
  parseSearch,
  type FolderSettings,
  type GithubPr,
} from "../src/github.ts";

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

const SETTINGS: FolderSettings = {
  sources: DEFAULT_SOURCES,
  myPrs: "attention",
  teamReviews: true,
  drafts: true,
  hiddenOrgs: new Set(),
  hiddenPrs: new Set(),
};

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

test("filters: sources, team reviews, drafts, orgs, hidden PRs", () => {
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
  assert.deepEqual(urls({ hiddenOrgs: new Set(["other"]) }), ["u/review", "u/draft"]);
  assert.deepEqual(urls({ sources: { ...DEFAULT_SOURCES, review: false } }), []);

  const hidden = buildFolder(all, { ...SETTINGS, hiddenPrs: new Set([hideKey(review)]) });
  assert.deepEqual(hidden.hidden.map((item) => item.pr.url), ["u/review"]);
  const updated = buildFolder([{ ...review, updatedAt: "2026-12-01T00:00:00Z" }], {
    ...SETTINGS,
    hiddenPrs: new Set([hideKey(review)]),
  });
  assert.equal(updated.items.length, 1);

  assert.deepEqual(buildFolder(all, SETTINGS).orgs, ["acme", "other"]);
});
