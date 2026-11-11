import { test } from "node:test";
import assert from "node:assert/strict";
import { createThreadPullRequestReader, mergePullRequests, readThreadPullRequests, type ThreadPullRequest } from "../src/threadPullRequests.ts";

const pr = (url: string, number = 1): ThreadPullRequest => ({ url, number, title: "Fix", state: "open", attention: "none", checks: { state: "none" } });

test("all session PRs survive URL deduplication, including equal numbers in different repos", () => {
  const a = pr("https://github.com/a/one/pull/1");
  const b = pr("https://github.com/a/two/pull/1");
  const merged = { ...a, state: "merged" as const };
  assert.deepEqual(mergePullRequests(merged, [a, b, a]), [merged, b]);
  assert.deepEqual(mergePullRequests(undefined, [a, b]), [a, b]);
});

test("session links are canonicalized and retained when status is unavailable", async () => {
  const calls: string[] = [];
  const result = await readThreadPullRequests("thread", async (method, input, schema) => {
    if (method === "links") return schema.parse({ links: [
      { kind: "pull-request", url: "https://github.com/a/one/pull/1/files", label: "One" },
      { kind: "pull-request", url: "https://github.com/a/one/pull/1#discussion", label: "One again" },
      { kind: "pull-request", url: "https://github.com/a/two/pull/1", label: "Two" },
      { kind: "issue", url: "https://github.com/a/one/issues/2", label: "Issue" },
      { kind: "pull-request", url: "https://example.com/a/one/pull/3", label: "Invalid" },
    ] });
    const url = "url" in input ? input.url : "";
    calls.push(url);
    if (url.includes("/two/")) throw new Error("offline");
    return schema.parse({ kind: "pull-request", pullRequest: { ...pr(url), conflicts: true, jobs: [{ state: "failed" }, { state: "pending" }] } });
  });
  assert.equal(result.length, 2);
  assert.equal(calls.length, 2);
  assert.equal(result[0]!.attention, "conflicts");
  assert.equal(result[0]!.checks.state, "failing");
  assert.equal(result[1]!.state, "unknown");
  assert.equal(result[1]!.url, "https://github.com/a/two/pull/1");
});

test("link discovery failure rejects rather than pretending the session is empty", async () => {
  await assert.rejects(readThreadPullRequests("thread", async () => { throw new Error("unavailable"); }), /unavailable/);
});


test("status concurrency is bounded across concurrent thread readers and recovers after failures", async () => {
  let active = 0;
  let peak = 0;
  let lookedUp = 0;
  const read = createThreadPullRequestReader(async (method, input, schema) => {
    if (method === "links") return schema.parse({ links: Array.from({ length: 4 }, (_, i) => ({
      kind: "pull-request", url: `https://github.com/a/${"threadId" in input ? input.threadId : "repo"}/pull/${i + 1}`, label: "PR",
    })) });
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    lookedUp++;
    throw new Error("offline");
  });
  const groups = await Promise.all(Array.from({ length: 8 }, (_, i) => read(`thread${i}`)));
  assert.equal(lookedUp, 32);
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.ok(groups.every((prs) => prs.length === 4 && prs.every((pr) => pr.state === "unknown")));
  assert.equal((await read("next-batch")).length, 4);
});
