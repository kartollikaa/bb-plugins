import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_LANDING_GRACE_MS,
  archiveInTurn,
  dialogOutsideSidebar,
  foldArchiveOutcome,
  waitForArchive,
} from "../src/archiveRun.ts";

const clean = async () => true;

test("bb's Archive runs on each root in turn, waiting for the one before", async () => {
  const log: string[] = [];
  const archived = new Set<string>();
  const result = await archiveInTurn(["a", "b"], {
    actionOf: (id) => async () => {
      log.push(`run ${id}`);
      await Promise.resolve();
      archived.add(id);
    },
    isStillClean: clean,
    landed: async (id) => (archived.has(id) ? "archived" : "cancelled"),
  });
  assert.deepEqual(result, { archived: ["a", "b"], changed: [], unchecked: [], stop: null });
  assert.deepEqual(log, ["run a", "run b"]);
});

test("a cancelled confirmation stops the run, so later roots aren't asked about", async () => {
  const log: string[] = [];
  const result = await archiveInTurn(["a", "b", "c"], {
    actionOf: (id) => async () => void log.push(id),
    isStillClean: clean,
    landed: async (id) => (id === "a" ? "archived" : "cancelled"),
  });
  assert.deepEqual(result, { archived: ["a"], changed: [], unchecked: [], stop: "cancelled" });
  assert.deepEqual(log, ["a", "b"]);
});

test("a root bb offers no Archive for stops the run", async () => {
  const result = await archiveInTurn(["a", "b"], {
    actionOf: (id) => (id === "a" ? undefined : async () => undefined),
    isStillClean: clean,
    landed: async () => "archived",
  });
  assert.deepEqual(result, { archived: [], changed: [], unchecked: [], stop: "unavailable" });
});

test("a root whose worktree got changes since the click is skipped, and the run goes on", async () => {
  const log: string[] = [];
  const result = await archiveInTurn(["a", "b", "c"], {
    actionOf: (id) => async () => void log.push(id),
    isStillClean: async (id) => id !== "b",
    landed: async () => "archived",
  });
  assert.deepEqual(result, { archived: ["a", "c"], changed: ["b"], unchecked: [], stop: null });
  assert.deepEqual(log, ["a", "c"]);
});

test("a stopped run asks about no further root", async () => {
  const controller = new AbortController();
  const log: string[] = [];
  const result = await archiveInTurn(["a", "b"], {
    actionOf: (id) => async () => void log.push(id),
    isStillClean: clean,
    landed: async () => {
      controller.abort();
      return "archived";
    },
    signal: controller.signal,
  });
  assert.deepEqual(result, { archived: ["a"], changed: [], unchecked: [], stop: "stopped" });
  assert.deepEqual(log, ["a"]);
});

function clock() {
  let time = 0;
  return { now: () => time, sleep: async (ms: number) => void (time += ms) };
}

test("the wait holds while bb's confirmation stays open, however long the user reads it", async () => {
  const { now, sleep } = clock();
  const result = await waitForArchive(async () => now() >= 60_000, {
    dialogOpen: () => now() < 60_000,
    deadline: 600_000,
    graceMs: 3_000,
    intervalMs: 500,
    now,
    sleep,
  });
  assert.equal(result, "archived");
});

test("with no dialog open, an archive that doesn't land within the grace reads as cancelled", async () => {
  const { now, sleep } = clock();
  const result = await waitForArchive(async () => false, { dialogOpen: () => now() < 10_000, deadline: 600_000, graceMs: 3_000, intervalMs: 500, now, sleep });
  assert.equal(result, "cancelled");
  assert.ok(now() >= 13_000 && now() < 14_000);
});

test("an archive that lands just after the dialog closes still counts", async () => {
  const { now, sleep } = clock();
  const result = await waitForArchive(async () => now() >= 11_000, { dialogOpen: () => now() < 10_000, deadline: 600_000, graceMs: 3_000, intervalMs: 500, now, sleep });
  assert.equal(result, "archived");
});

test("the wait gives up at the deadline and on Stop", async () => {
  const { now, sleep } = clock();
  assert.equal(await waitForArchive(async () => false, { dialogOpen: () => true, deadline: 5_000, graceMs: 3_000, intervalMs: 500, now, sleep }), "timeout");
  const controller = new AbortController();
  controller.abort();
  assert.equal(await waitForArchive(async () => false, { dialogOpen: () => true, deadline: 5_000, graceMs: 3_000, intervalMs: 500, now, sleep, signal: controller.signal }), "stopped");
});

test("a run that archived everything without skips leaves the word to bb's own toast", () => {
  assert.equal(foldArchiveOutcome({ archived: 6, skipped: 0, kept: 0, changed: 0, stop: null }), null);
});

test("a deliberate cancel of the only root stays silent", () => {
  assert.equal(foldArchiveOutcome({ archived: 0, skipped: 0, kept: 0, changed: 0, stop: "cancelled" }), null);
});

test("a run cut short after some roots says so even without skips", () => {
  assert.deepEqual(foldArchiveOutcome({ archived: 3, skipped: 0, kept: 0, changed: 0, stop: "stopped" }), {
    tone: "warning",
    title: "Archived 3 threads",
    description: "Stopped before the rest",
  });
});

test("skips and threads changed since the click go into the summary", () => {
  assert.deepEqual(foldArchiveOutcome({ archived: 4, skipped: 1, kept: 1, changed: 2, stop: null }), {
    tone: "success",
    title: "Archived 4 threads",
    description: "Skipped 1 thread with uncommitted changes and 1 thread kept with them. Skipped 2 threads that got changes since",
  });
});

test("silent endings get a reason", () => {
  assert.equal(foldArchiveOutcome({ archived: 0, skipped: 0, kept: 0, changed: 0, stop: "busy" })?.title, "Another fold is still archiving");
  assert.deepEqual(foldArchiveOutcome({ archived: 0, skipped: 0, kept: 0, changed: 0, stop: "unavailable" }), {
    tone: "error",
    title: "Archive stopped",
    description: "bb offers no Archive for one of the threads",
  });
  assert.equal(foldArchiveOutcome({ archived: 0, skipped: 0, kept: 0, changed: 0, stop: "timeout" })?.description, "bb's confirmation wasn't answered in time");
  assert.equal(foldArchiveOutcome({ archived: 0, skipped: 0, kept: 0, changed: 2, stop: null })?.title, "Nothing archived");
});

test("a dialog that holds the sidebar itself, the compact-width drawer, is not bb's confirmation", () => {
  const sidebar = { id: "sidebar" };
  const drawer = { contains: (node: unknown) => node === sidebar };
  const confirm = { contains: () => false };
  assert.equal(dialogOutsideSidebar([drawer], sidebar), false);
  assert.equal(dialogOutsideSidebar([drawer, confirm], sidebar), true);
  assert.equal(dialogOutsideSidebar([confirm], null), true);
  assert.equal(dialogOutsideSidebar([], sidebar), false);
});

test("a worktree check that fails skips the root as unchecked, not as changed", async () => {
  const result = await archiveInTurn(["a", "b"], {
    actionOf: () => async () => undefined,
    isStillClean: async (id) => {
      if (id === "a") throw new Error("rpc down");
      return true;
    },
    landed: async () => "archived",
  });
  assert.deepEqual(result, { archived: ["b"], changed: [], unchecked: ["a"], stop: null });
  assert.equal(
    foldArchiveOutcome({ archived: 1, skipped: 0, kept: 0, changed: 0, unchecked: 2, stop: null })?.description,
    "Skipped 2 threads whose worktrees couldn't be checked",
  );
});

test("the landing grace covers a slow cascade that takes several seconds to record", async () => {
  assert.ok(ARCHIVE_LANDING_GRACE_MS >= 10_000);
  const { now, sleep } = clock();
  const result = await waitForArchive(async () => now() >= 18_000, { dialogOpen: () => now() < 10_000, deadline: 600_000, intervalMs: 500, now, sleep });
  assert.equal(result, "archived");
});
