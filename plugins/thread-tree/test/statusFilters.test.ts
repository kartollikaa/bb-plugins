import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countStatusFilters,
  filterThreads,
  isSearchKey,
  statusSummary,
  orchestrationTitle,
  runningContext,
  searchThreads,
  STATUS_FILTERS,
  statusFilterOf,
  type FilterThread,
} from "../src/statusFilters.ts";
import { rowHeightPx } from "../src/rowActions.ts";

const thread = (id: string, extra: Partial<FilterThread> = {}): FilterThread => ({
  id,
  projectId: "p1",
  parentThreadId: null,
  lifecycleOwnerThreadId: null,
  isPinned: false,
  pinSortKey: null,
  pinnedAt: null,
  isHidden: false,
  isArchived: false,
  isUnread: false,
  status: "idle",
  indicator: "none",
  hasPendingInteraction: false,
  activity: { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 },
  createdAt: 0,
  updatedAt: 0,
  displayTitle: id,
  environment: null,
  ...extra,
  latestAttentionAt: extra.latestAttentionAt ?? extra.updatedAt ?? 0,
});

const ids = (threads: readonly { id: string }[]) => threads.map((t) => t.id);

test("the status line has four counts in the spec's order: need input, failed, running, finished but unread", () => {
  assert.deepEqual(STATUS_FILTERS.map((f) => f.id), ["input", "error", "running", "unread"]);
});

test("each thread lands in at most one filter, the most urgent one", () => {
  assert.equal(statusFilterOf(thread("q", { hasPendingInteraction: true, status: "active", isUnread: true })), "input");
  assert.equal(statusFilterOf(thread("f", { status: "error", isUnread: true })), "error");
  assert.equal(statusFilterOf(thread("qf", { indicator: "queued-failed" })), "error");
  assert.equal(statusFilterOf(thread("r", { status: "active", isUnread: true })), "running");
  assert.equal(statusFilterOf(thread("bg", { activity: { backgroundAgents: 1, backgroundCommands: 0, workflows: 0 } })), "running");
  assert.equal(statusFilterOf(thread("u", { isUnread: true })), "unread");
  assert.equal(statusFilterOf(thread("w", { indicator: "queued-waiting", isUnread: true })), "unread");
  assert.equal(statusFilterOf(thread("idle")), null);
});

test("counts cover visible, unarchived threads only, with every filter present even at zero", () => {
  const counts = countStatusFilters([
    thread("a", { status: "active" }),
    thread("b", { status: "active" }),
    thread("c", { isUnread: true }),
    thread("hidden", { status: "error", isHidden: true }),
    thread("archived", { status: "error", isArchived: true }),
    thread("idle"),
  ]);
  assert.deepEqual(counts, { input: 0, error: 0, running: 2, unread: 1 });
});

test("a filter lists its threads flat, children included, most recently active first", () => {
  const threads = [
    thread("old", { status: "active", updatedAt: 1 }),
    thread("kid", { status: "active", parentThreadId: "old", updatedAt: 3 }),
    thread("new", { status: "active", updatedAt: 2 }),
    thread("idle", { updatedAt: 9 }),
    thread("gone", { status: "active", isArchived: true, updatedAt: 9 }),
  ];
  assert.deepEqual(ids(filterThreads(threads, "running")), ["kid", "new", "old"]);
  assert.deepEqual(ids(filterThreads(threads, "input")), []);
});

test("search matches title, branch, PR number and project, every word somewhere, ignoring case", () => {
  const threads = [
    thread("t1", { displayTitle: "Fix payments sheet", projectId: "app", updatedAt: 1 }),
    thread("t2", { displayTitle: "Release notes", environment: { branchName: "feature/payments-v2" }, updatedAt: 2 }),
    thread("t3", { displayTitle: "Review", projectId: "bb", updatedAt: 3 }),
    thread("t4", { displayTitle: "Untitled", updatedAt: 4 }),
  ];
  const describe = (t: FilterThread) => ({
    projectName: t.projectId === "bb" ? "bb-plugins" : t.projectId === "app" ? "Mobile App" : "Personal",
    pullRequestNumbers: t.id === "t4" ? [7180] : [],
  });
  assert.deepEqual(ids(searchThreads(threads, "PAYMENTS", describe)), ["t2", "t1"]);
  assert.deepEqual(ids(searchThreads(threads, "bb-plug", describe)), ["t3"]);
  assert.deepEqual(ids(searchThreads(threads, "#7180", describe)), ["t4"]);
  assert.deepEqual(ids(searchThreads(threads, "7180", describe)), ["t4"]);
  assert.deepEqual(ids(searchThreads(threads, "#71", describe)), ["t4"], "a PR number matches while it is typed");
  assert.deepEqual(ids(searchThreads(threads, "mobile sheet", describe)), ["t1"]);
  assert.deepEqual(ids(searchThreads(threads, "mobile notes", describe)), []);
  assert.deepEqual(ids(searchThreads(threads, "   ", describe)), []);
});

test("search skips hidden threads", () => {
  const threads = [thread("seen", { displayTitle: "Deploy" }), thread("helper", { displayTitle: "Deploy", isHidden: true })];
  assert.deepEqual(ids(searchThreads(threads, "deploy", () => ({ projectName: null, pullRequestNumbers: [] }))), ["seen"]);
});

test("a Running row's second line names its project and the orchestration it runs under", () => {
  assert.equal(runningContext("bb-plugins", "Orchestrate PR review"), "bb-plugins · under Orchestrate PR review");
  assert.equal(runningContext("bb-plugins", null), "bb-plugins");
  assert.equal(runningContext(null, null), "");
});

test("a Running row names the orchestration at the top of its family, not its direct parent", () => {
  const threads = [
    thread("o", { displayTitle: "Orchestrate PR review" }),
    thread("a", { parentThreadId: "o", displayTitle: "Slice A" }),
    thread("b", { parentThreadId: "a", displayTitle: "Helper B" }),
    thread("pinned", { parentThreadId: "a", isPinned: true, displayTitle: "Pinned helper" }),
  ];
  const titleOf = orchestrationTitle(threads);
  assert.equal(titleOf("b"), "Orchestrate PR review");
  assert.equal(titleOf("a"), "Orchestrate PR review");
  assert.equal(titleOf("pinned"), "Orchestrate PR review", "pinning moves the row, not the thread out of its orchestration");
  assert.equal(titleOf("o"), null, "the orchestrator itself runs under nothing");
});

test("a two-line row is taller than a one-line row on every viewport", () => {
  assert.ok(rowHeightPx(false, 2) > rowHeightPx(false));
  assert.ok(rowHeightPx(true, 2) > rowHeightPx(true));
});

const key = (key: string, extra: Partial<Parameters<typeof isSearchKey>[0]> = {}) => ({
  key, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false, isComposing: false, typing: false, ...extra,
});

test("/ opens search only outside text fields, without modifiers, when nothing else took the key", () => {
  assert.equal(isSearchKey(key("/")), true);
  assert.equal(isSearchKey(key("/", { typing: true })), false);
  assert.equal(isSearchKey(key("/", { metaKey: true })), false);
  assert.equal(isSearchKey(key("/", { ctrlKey: true })), false);
  assert.equal(isSearchKey(key("/", { altKey: true })), false);
  assert.equal(isSearchKey(key("/", { defaultPrevented: true })), false);
  assert.equal(isSearchKey(key("/", { isComposing: true })), false);
  assert.equal(isSearchKey(key("?")), false);
});

test("the status summary names the nonzero counts, or says nothing is going on", () => {
  assert.equal(statusSummary({ input: 1, error: 0, running: 3, unread: 0 }), "1 need input, 3 running");
  assert.equal(statusSummary({ input: 0, error: 0, running: 0, unread: 0 }), "No threads need attention");
});

test("closing the flat list or search hands focus back to the control that opened it, only when focus was lost", async () => {
  const { returnFocus } = await import("../src/statusFilters.ts");
  const body = { name: "body" };
  const focused: string[] = [];
  const root = { querySelector: (selector: string) => ({ focus: () => focused.push(selector) }) };
  assert.equal(returnFocus({ activeElement: body, body }, root, { filter: "running" }), true);
  assert.equal(returnFocus({ activeElement: null, body }, root, { search: true }), true);
  assert.deepEqual(focused, ['[data-status-filter="running"]', "[data-thread-search-open]"]);
  assert.equal(returnFocus({ activeElement: { name: "elsewhere" }, body }, root, { filter: "input" }), false, "a click elsewhere keeps its focus");
  assert.equal(returnFocus({ activeElement: body, body }, { querySelector: () => null }, { search: true }), false);
  assert.equal(focused.length, 2);
});

const keyEvent = (key: string) => {
  const calls: string[] = [];
  return {
    calls,
    event: {
      key, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false, isComposing: false,
      composedPath: () => { calls.push("composedPath"); return []; },
      preventDefault: () => calls.push("preventDefault"),
      stopPropagation: () => calls.push("stopPropagation"),
    },
  };
};

test("the / listener ignores every other key before touching the DOM", async () => {
  const { handleSearchKey } = await import("../src/statusFilters.ts");
  const queries: string[] = [];
  const env = {
    modalOpen: () => { queries.push("modal"); return false; },
    sidebarShown: () => { queries.push("sidebar"); return true; },
    open: () => queries.push("open"),
  };
  const other = keyEvent("a");
  assert.equal(handleSearchKey(other.event, env), false);
  assert.deepEqual([...other.calls, ...queries], []);
  const slash = keyEvent("/");
  assert.equal(handleSearchKey(slash.event, env), true);
  assert.deepEqual(queries, ["modal", "sidebar", "open"]);
  assert.deepEqual(slash.calls, ["composedPath", "preventDefault"]);
  const behindModal = keyEvent("/");
  const opened: string[] = [];
  assert.equal(handleSearchKey(behindModal.event, { modalOpen: () => true, sidebarShown: () => true, open: () => opened.push("open") }), false);
  assert.deepEqual([...behindModal.calls, ...opened], ["composedPath"], "a modal keeps / and search stays shut");
});

test("only a modal dialog takes / away; a non-modal popover's role=dialog does not", async () => {
  const { isModalDialog } = await import("../src/statusFilters.ts");
  const el = (attributes: Record<string, string>) => ({ getAttribute: (name: string) => attributes[name] ?? null });
  assert.equal(isModalDialog(el({ role: "dialog" })), false);
  assert.equal(isModalDialog(el({ role: "dialog", "aria-modal": "true" })), true);
  assert.equal(isModalDialog(el({ role: "alertdialog" })), true);
  assert.equal(isModalDialog(el({ role: "dialog", "aria-modal": "false" })), false);
});

test("Escape in the flat list closes it and keeps bb's own Escape handlers out of it", async () => {
  const { handleFlatListEscape } = await import("../src/statusFilters.ts");
  let closed = 0;
  const escape = keyEvent("Escape");
  assert.equal(handleFlatListEscape(escape.event, true, () => closed++), true);
  assert.deepEqual(escape.calls, ["preventDefault", "stopPropagation"]);
  const shut = keyEvent("Escape");
  assert.equal(handleFlatListEscape(shut.event, false, () => closed++), false);
  assert.equal(handleFlatListEscape(keyEvent("Enter").event, true, () => closed++), false);
  assert.equal(closed, 1);
});

test("a Radix modal has no aria-modal but hides the rest of the page, sidebar included, so / stays out", async () => {
  const { sidebarBehindModal } = await import("../src/statusFilters.ts");
  const at = (match: string | null) => ({ closest: (selector: string) => (match && selector.includes(match) ? {} : null) });
  assert.equal(sidebarBehindModal(at('[aria-hidden="true"]')), true);
  assert.equal(sidebarBehindModal(at("[inert]")), true);
  assert.equal(sidebarBehindModal(at(null)), false);
});

test("the empty search box closing on blur leaves focus where the click put it", async () => {
  const { refocusAfterClose } = await import("../src/statusFilters.ts");
  assert.equal(refocusAfterClose({ search: true }, "blur"), null);
  assert.deepEqual(refocusAfterClose({ search: true }, "action"), { search: true });
  assert.deepEqual(refocusAfterClose({ filter: "input" }, "action"), { filter: "input" });
});

test("a filter's list keeps its order when a listed thread is opened", () => {
  const threads = [
    thread("a", { status: "active", latestAttentionAt: 5, updatedAt: 100 }),
    thread("b", { status: "active", latestAttentionAt: 9, updatedAt: 9 }),
  ];
  assert.deepEqual(filterThreads(threads, "running").map((t) => t.id), ["b", "a"]);
});
