import { test } from "node:test";
import assert from "node:assert/strict";
import { composePrompt, githubRepoOfRemote, parsePrUrl, parsePrView, projectForRepo } from "../lib/pr-context.ts";

const VIEW = {
  url: "https://github.com/acme/app/pull/42",
  number: 42,
  title: "Add login",
  body: "<!-- template hint -->\r\nAdds the login screen.\r\n\r\n\r\n\r\nCloses #7",
  state: "OPEN",
  isDraft: true,
  author: { login: "dima" },
  headRefName: "feature/login",
  baseRefName: "main",
  reviewDecision: "CHANGES_REQUESTED",
  mergeable: "CONFLICTING",
  additions: 120,
  deletions: 4,
  changedFiles: 1,
  labels: [{ name: "ui" }],
  statusCheckRollup: [
    { __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "FAILURE" },
    { __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "SUCCESS" },
    { __typename: "CheckRun", name: "build", status: "IN_PROGRESS", conclusion: "" },
    { __typename: "StatusContext", context: "ci/legacy", state: "ERROR" },
  ],
};

test("parsePrUrl accepts PR URLs only", () => {
  assert.deepEqual(parsePrUrl("https://github.com/acme/app/pull/42"), { repo: "acme/app", number: 42 });
  assert.deepEqual(parsePrUrl("https://github.com/acme/app/pull/42/files#diff"), { repo: "acme/app", number: 42 });
  assert.equal(parsePrUrl("https://github.com/acme/app/issues/42"), null);
  assert.equal(parsePrUrl("https://evil.example/acme/app/pull/42"), null);
  assert.equal(parsePrUrl("--repo=x"), null);
});

test("parsePrView reads status, review and checks", () => {
  const pr = parsePrView(VIEW);
  assert.equal(pr.repo, "acme/app");
  assert.equal(pr.state, "open");
  assert.equal(pr.review, "changes_requested");
  assert.equal(pr.conflicts, true);
  assert.deepEqual(pr.labels, ["ui"]);
  assert.deepEqual(pr.checks, { failed: ["lint", "ci/legacy"], pending: 1, passed: 1 });
  assert.equal(parsePrView({ ...VIEW, state: "MERGED" }).state, "merged");
  assert.equal(parsePrView({}).title, "");
});

test("composePrompt carries title, status and a cleaned description", () => {
  const prompt = composePrompt(parsePrView(VIEW));
  assert.match(prompt, /^Pull request acme\/app#42: Add login\nhttps:\/\/github.com\/acme\/app\/pull\/42\n/);
  assert.match(prompt, /Status: Open, draft · Review: changes requested · CI: 2 failed \(lint, ci\/legacy\) · Merge conflicts/);
  assert.match(prompt, /Branch: feature\/login → main · by @dima · \+120 −4 in 1 file · Labels: ui/);
  assert.match(prompt, /Description:\nAdds the login screen.\n\nCloses #7\n\n$/);
  assert.doesNotMatch(prompt, /template hint|\r/);
});

test("composePrompt handles an empty description and truncates a long one", () => {
  const empty = composePrompt(parsePrView({ ...VIEW, body: "", statusCheckRollup: [] }));
  assert.match(empty, /\(no description\)/);
  assert.doesNotMatch(empty, /CI:/);
  const long = composePrompt(parsePrView({ ...VIEW, body: "x".repeat(10_000) }));
  assert.ok(long.length < 7_000);
  assert.match(long, /truncated/);
});

test("githubRepoOfRemote reads every remote form", () => {
  for (const remote of [
    "git@github.com:Acme/App.git",
    "https://github.com/acme/app.git",
    "https://github.com/acme/app",
    "https://token@github.com/acme/app.git",
    "ssh://git@github.com/acme/app.git",
  ]) {
    assert.equal(githubRepoOfRemote(remote), "acme/app", remote);
  }
  assert.equal(githubRepoOfRemote("git@gitlab.com:acme/app.git"), null);
});

test("projectForRepo picks the single matching project", () => {
  const projects = [
    { id: "p1", gitRemoteUrl: "git@github.com:acme/app.git" },
    { id: "p2", gitRemoteUrl: "git@github.com:acme/other.git" },
    { id: "p3", gitRemoteUrl: null },
  ];
  assert.equal(projectForRepo(projects, "Acme/App"), "p1");
  assert.equal(projectForRepo(projects, "acme/none"), null);
  assert.equal(projectForRepo([...projects, { id: "p4", gitRemoteUrl: "https://github.com/acme/app" }], "acme/app"), null);
});
