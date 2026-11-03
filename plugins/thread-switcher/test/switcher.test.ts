import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatHotkey,
  hotkeyFromEvent,
  hotkeyModifierReleased,
  matchHotkey,
  parseHotkey,
  type KeyLike,
} from "../lib/hotkey.ts";
import {
  clampThreadCount,
  cleanText,
  initialIndex,
  orderThreads,
  parseRecent,
  previewFromTimeline,
  recordVisit,
  stepIndex,
} from "../lib/switcher.ts";

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  key: "",
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

test("parses hotkeys with aliases and rejects ones without a holdable modifier", () => {
  assert.deepEqual(parseHotkey("Control+Tab"), { ctrl: true, alt: false, shift: false, meta: false, key: "Tab" });
  assert.equal(formatHotkey(parseHotkey("opt + cmd + k")!), "Option+Command+K");
  assert.equal(formatHotkey(parseHotkey("Ctrl+`")!), "Control+`");
  assert.equal(parseHotkey("Tab"), null);
  assert.equal(parseHotkey("Shift+Tab"), null);
  assert.equal(parseHotkey("Control+"), null);
  assert.equal(parseHotkey("Hyper+Tab"), null);
  assert.equal(parseHotkey("Control+Tab+K"), null);
});

test("matches forward, Shift backward, and ignores other modifiers", () => {
  const hotkey = parseHotkey("Control+Tab")!;
  assert.equal(matchHotkey(key("Tab", { ctrlKey: true }), hotkey), "forward");
  assert.equal(matchHotkey(key("Tab", { ctrlKey: true, shiftKey: true }), hotkey), "backward");
  assert.equal(matchHotkey(key("Tab", { ctrlKey: true, metaKey: true }), hotkey), null);
  assert.equal(matchHotkey(key("Tab"), hotkey), null);
  assert.equal(matchHotkey(key("KeyK", { ctrlKey: true }), hotkey), null);
});

test("a hotkey with Shift only moves forward", () => {
  const hotkey = parseHotkey("Command+Shift+K")!;
  assert.equal(matchHotkey(key("KeyK", { metaKey: true, shiftKey: true }), hotkey), "forward");
  assert.equal(matchHotkey(key("KeyK", { metaKey: true }), hotkey), null);
});

test("reads the physical key so Option combos record as letters", () => {
  assert.equal(formatHotkey(hotkeyFromEvent(key("KeyK", { altKey: true, key: "˚" }))!), "Option+K");
  assert.equal(hotkeyFromEvent(key("ControlLeft", { ctrlKey: true })), null);
  assert.equal(hotkeyFromEvent(key("KeyK")), null);
});

test("commits when any hotkey modifier is released", () => {
  const hotkey = parseHotkey("Control+Option+Tab")!;
  assert.equal(hotkeyModifierReleased({ ctrlKey: true, altKey: true, metaKey: false }, hotkey), false);
  assert.equal(hotkeyModifierReleased({ ctrlKey: false, altKey: true, metaKey: false }, hotkey), true);
  assert.equal(hotkeyModifierReleased({ ctrlKey: true, altKey: false, metaKey: true }, hotkey), true);
});

test("records visits most recent first without duplicates", () => {
  assert.deepEqual(recordVisit(["a", "b", "c"], "c"), ["c", "a", "b"]);
  assert.equal(recordVisit(Array.from({ length: 60 }, (_, i) => `t${i}`), "x").length, 50);
  assert.deepEqual(parseRecent('["a", 3, "b"]'), ["a", "b"]);
  assert.deepEqual(parseRecent("{"), []);
  assert.deepEqual(parseRecent(null), []);
});

test("orders current, then visited, then recently updated, skipping archived and hidden", () => {
  const thread = (id: string, updatedAt: number, extra = {}) => ({
    id,
    updatedAt,
    isArchived: false,
    isHidden: false,
    ...extra,
  });
  const threads = [
    thread("old", 1),
    thread("new", 9),
    thread("visited", 2),
    thread("current", 3),
    thread("archived", 10, { isArchived: true }),
    thread("hidden", 10, { isHidden: true }),
  ];
  const ids = orderThreads(threads, ["visited", "archived"], "current", 6).map((t) => t.id);
  assert.deepEqual(ids, ["current", "visited", "new", "old"]);
  assert.equal(orderThreads(threads, [], null, 2).length, 2);
});

test("puts urgent threads after the current one and keeps recency within a group", () => {
  const thread = (id: string, updatedAt: number) => ({ id, updatedAt, isArchived: false, isHidden: false });
  const threads = [thread("current", 1), thread("a", 9), thread("b", 8), thread("failed", 2), thread("waiting", 1)];
  const urgency = (t: { id: string }) => (t.id === "waiting" || t.id === "current" ? 0 : t.id === "failed" ? 1 : 2);
  const ids = orderThreads(threads, ["b"], "current", 4, urgency).map((t) => t.id);
  assert.deepEqual(ids, ["current", "waiting", "failed", "b"]);
});

test("clamps the thread count setting", () => {
  assert.equal(clampThreadCount(undefined), 6);
  assert.equal(clampThreadCount(1), 2);
  assert.equal(clampThreadCount(99), 20);
  assert.equal(clampThreadCount(7.4), 7);
});

test("steps wrap around and the first press picks the previous thread", () => {
  assert.equal(stepIndex(3, 1, 4), 0);
  assert.equal(stepIndex(0, -1, 4), 3);
  assert.equal(initialIndex("forward", 4, true), 1);
  assert.equal(initialIndex("forward", 4, false), 0);
  assert.equal(initialIndex("backward", 4, true), 3);
  assert.equal(initialIndex("forward", 1, true), 0);
});

test("extracts the last conversation messages from nested timeline rows", () => {
  const timeline = {
    rows: [
      { kind: "conversation", role: "user", id: "u1", text: "first", initiator: "user" },
      {
        kind: "turn",
        children: [
          { kind: "work", id: "w1" },
          { kind: "conversation", role: "assistant", id: "a1", text: "**done** see [docs](http://x)" },
        ],
      },
      { kind: "conversation", role: "user", id: "s1", text: "system note", initiator: "system" },
      { kind: "conversation", role: "assistant", id: "a2", text: "   " },
    ],
  };
  assert.deepEqual(previewFromTimeline(timeline), {
    messages: [
      { id: "u1", role: "user", text: "first", markdown: "first" },
      { id: "a1", role: "assistant", text: "done see docs", markdown: "**done** see [docs](http://x)" },
    ],
    pending: null,
  });
  assert.deepEqual(previewFromTimeline(null), { messages: [], pending: null });
  assert.deepEqual(previewFromTimeline({ rows: "nope" }), { messages: [], pending: null });
  const many = { rows: Array.from({ length: 14 }, (_, i) => ({ kind: "conversation", role: "assistant", id: `m${i}`, text: `m${i}` })) };
  assert.deepEqual(previewFromTimeline(many).messages.map((m) => m.id)[0], "m4");
});

test("reports what a thread is waiting on, ignoring answered requests", () => {
  const turn = (children: unknown[]) => ({ rows: [{ kind: "turn", children }] });
  const question = (lifecycle: string) => ({
    kind: "work",
    workKind: "question",
    lifecycle,
    questions: [{ prompt: "Ship it?" }, { prompt: "Which branch?" }],
  });
  assert.equal(previewFromTimeline(turn([question("pending")])).pending, "Ship it?\n\nWhich branch?");
  assert.equal(previewFromTimeline(turn([question("answered")])).pending, null);
  const command = { kind: "work", workKind: "command", id: "c1", command: "rm -rf dist" };
  const approval = { kind: "work", workKind: "approval", lifecycle: "pending", target: { itemId: "c1", toolName: "Bash" } };
  assert.equal(previewFromTimeline(turn([command, approval])).pending, "Approve: rm -rf dist");
  const orphan = { ...approval, target: { itemId: "gone", toolName: "Edit" } };
  assert.equal(previewFromTimeline(turn([orphan])).pending, "Approve: Edit");
  const form = { kind: "work", workKind: "form", lifecycle: "pending", title: "Pick a model" };
  assert.equal(previewFromTimeline(turn([form])).pending, "Pick a model");
});

test("cleans markdown and code blocks for the small preview", () => {
  assert.equal(cleanText("## Title\n```ts\nconst a = 1;\n```\nok"), "Title\n[code]\nok");
});

test("status dot follows thread-tree's priority: input, error, running, done", async () => {
  const { threadDotState } = await import("../lib/status.ts");
  const base = {
    status: "idle",
    indicator: "none",
    hasPendingInteraction: false,
    activity: { backgroundAgents: 0, backgroundCommands: 0, workflows: 0 },
  };
  assert.equal(threadDotState({ ...base, hasPendingInteraction: true, status: "active" }), "input");
  assert.equal(threadDotState({ ...base, indicator: "waiting-for-input" }), "input");
  assert.equal(threadDotState({ ...base, status: "error", indicator: "runtime" }), "error");
  assert.equal(threadDotState({ ...base, indicator: "unread-error" }), "error");
  assert.equal(threadDotState({ ...base, status: "active" }), "running");
  assert.equal(threadDotState({ ...base, activity: { backgroundAgents: 1, backgroundCommands: 0, workflows: 0 } }), "running");
  assert.equal(threadDotState({ ...base, indicator: "unread" }), "done");
  const { threadUrgency } = await import("../lib/status.ts");
  assert.ok(threadUrgency({ ...base, hasPendingInteraction: true }) < threadUrgency({ ...base, status: "error" }));
  assert.ok(threadUrgency({ ...base, status: "error" }) < threadUrgency({ ...base, status: "active" }));
  assert.equal(threadUrgency({ ...base, status: "active" }), threadUrgency(base));
});

test("ages read like the sidebar's", async () => {
  const { formatAge } = await import("../lib/switcher.ts");
  const now = 10_000_000_000;
  assert.equal(formatAge(now - 30_000, now), "now");
  assert.equal(formatAge(now - 5 * 60_000, now), "5m");
  assert.equal(formatAge(now - 3 * 3_600_000, now), "3h");
  assert.equal(formatAge(now - 3 * 86_400_000, now), "3d");
  assert.equal(formatAge(now - 21 * 86_400_000, now), "3w");
});
