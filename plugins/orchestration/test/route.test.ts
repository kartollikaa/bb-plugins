import { test } from "node:test";
import assert from "node:assert/strict";
import { chatPlacement, chatPreference, dockHeight, DOCK, viewEnabled, clampRailWidth, railMode, railOpen, RAIL, shouldOpenView, threadFromSubPath, VIEW_PATH, type PreferenceStorage } from "../src/route.ts";

test("the view's subPath is the thread id", () => {
  assert.equal(VIEW_PATH, "orchestrator");
  assert.equal(threadFromSubPath("thr_abc123"), "thr_abc123");
  assert.equal(threadFromSubPath("thr_abc123/"), "thr_abc123");
});

test("a subPath that isn't a thread id names no thread", () => {
  assert.equal(threadFromSubPath(""), null);
  assert.equal(threadFromSubPath("notes"), null);
  assert.equal(threadFromSubPath("thr_%2F..%2Fx"), null);
  assert.equal(threadFromSubPath("%E0%A4%A"), null);
});

function memory(): PreferenceStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("a thread opens in the view until the owner picks the full chat, and back", () => {
  const pref = chatPreference(memory());
  assert.equal(pref.prefersChat("thr_a"), false);
  pref.set("thr_a", "chat");
  assert.equal(pref.prefersChat("thr_a"), true);
  assert.equal(pref.prefersChat("thr_b"), false);
  pref.set("thr_a", "view");
  assert.equal(pref.prefersChat("thr_a"), false);
});

test("a storage that throws reads as no preference and never breaks a write", () => {
  const broken: PreferenceStorage = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
  const pref = chatPreference(broken);
  assert.doesNotThrow(() => pref.set("thr_a", "chat"));
  assert.equal(pref.prefersChat("thr_a"), false);
  assert.equal(chatPreference(null).prefersChat("thr_a"), false);
});

test("the redirect fires once, on the first known membership, for an orchestrator the owner didn't switch to chat", () => {
  const base = { enabled: true, membership: true, prefersChat: false, inSplit: false, decided: false } as const;
  assert.equal(shouldOpenView(base), true);
  assert.equal(shouldOpenView({ ...base, prefersChat: true }), false);
  assert.equal(shouldOpenView({ ...base, membership: false }), false);
  assert.equal(shouldOpenView({ ...base, membership: null }), false);
});

test("a thread that turns into an orchestrator while open stays in its chat", () => {
  assert.equal(shouldOpenView({ enabled: true, membership: true, prefersChat: false, inSplit: false, decided: true }), false);
});

test("a split layout is never torn down by the redirect", () => {
  assert.equal(shouldOpenView({ enabled: true, membership: true, prefersChat: false, inSplit: true, decided: false }), false);
});

test("the rail opens by default as a rail, closed as a drawer, and a choice holds only for its thread and mode", () => {
  assert.equal(railOpen(null, "thr_a:rail", "rail"), true);
  assert.equal(railOpen(null, "thr_a:drawer", "drawer"), false);
  assert.equal(railOpen({ key: "thr_a:rail", open: false }, "thr_a:rail", "rail"), false);
  assert.equal(railOpen({ key: "thr_a:rail", open: true }, "thr_a:drawer", "drawer"), false);
  assert.equal(railOpen({ key: "thr_a:rail", open: false }, "thr_b:rail", "rail"), true);
});

test("the rail turns into a drawer below 900px of page width", () => {
  assert.equal(railMode(1400), "rail");
  assert.equal(railMode(900), "rail");
  assert.equal(railMode(899), "drawer");
});

test("the rail width stays between 340px and the smaller of 560px and half the page", () => {
  assert.equal(RAIL.default, 400);
  assert.equal(clampRailWidth(400, 1600), 400);
  assert.equal(clampRailWidth(100, 1600), 340);
  assert.equal(clampRailWidth(900, 1600), 560);
  assert.equal(clampRailWidth(520, 1000), 500);
  assert.equal(clampRailWidth(520, 600), 340);
  assert.equal(clampRailWidth(Number.NaN, 1600), 400);
});

test("the orchestration view switch is on unless the setting says false", () => {
  assert.equal(viewEnabled(undefined), true);
  assert.equal(viewEnabled({}), true);
  assert.equal(viewEnabled({ orchestrationView: true }), true);
  assert.equal(viewEnabled({ orchestrationView: false }), false);
  assert.equal(viewEnabled({ orchestrationView: "false" }), true);
});

test("with the switch off, an orchestrator thread stays in bb's thread view", () => {
  assert.equal(shouldOpenView({ enabled: false, membership: true, prefersChat: false, inSplit: false, decided: false }), false);
});

test("the chat shows its composer in exactly one place: the rail or sheet when open, docked under the view when not", () => {
  assert.equal(chatPlacement("rail", true), "rail");
  assert.equal(chatPlacement("rail", false), "docked");
  assert.equal(chatPlacement("drawer", true), "sheet");
  assert.equal(chatPlacement("drawer", false), "docked");
});

test("the dock is as tall as bb's composer, with a fallback before it is measured and a cap at half the page", () => {
  assert.equal(dockHeight(117, 900), 117);
  assert.equal(dockHeight(null, 900), DOCK.fallback);
  assert.equal(dockHeight(0, 900), DOCK.fallback);
  assert.equal(dockHeight(Number.NaN, 900), DOCK.fallback);
  assert.equal(dockHeight(700, 900), 450);
  assert.equal(dockHeight(117.4, 900), 118);
});

test("the chat sheet follows a flick, else flips once dragged a quarter of the way", async () => {
  const { sheetSettles, sheetHeightWhileDragging } = await import("../src/route.ts");
  assert.equal(sheetSettles({ wasOpen: false, dy: -30, velocity: -0.8, span: 600 }), true, "a quick flick up opens");
  assert.equal(sheetSettles({ wasOpen: true, dy: 20, velocity: 0.9, span: 600 }), false, "a quick flick down closes");
  assert.equal(sheetSettles({ wasOpen: false, dy: -100, velocity: -0.1, span: 600 }), false, "a slow short drag snaps back");
  assert.equal(sheetSettles({ wasOpen: false, dy: -200, velocity: -0.1, span: 600 }), true);
  assert.equal(sheetSettles({ wasOpen: true, dy: 200, velocity: 0.1, span: 600 }), false);
  assert.equal(sheetSettles({ wasOpen: true, dy: -200, velocity: -0.1, span: 600 }), true, "dragging an open sheet up keeps it open");
  assert.equal(sheetHeightWhileDragging(140, -1000, 140, 700), 700);
  assert.equal(sheetHeightWhileDragging(700, 1000, 140, 700), 140);
  assert.equal(sheetHeightWhileDragging(140, -60, 140, 700), 200);
});

test("folded, a vertical drag anywhere on the dock moves the sheet; open, the transcript scrolls until its top", async () => {
  const { sheetGestureOwner } = await import("../src/route.ts");
  const g = (o: Partial<Parameters<typeof sheetGestureOwner>[0]>) => sheetGestureOwner({ open: false, dx: 0, dy: -40, inHandle: false, scrollTop: 300, ...o });
  assert.equal(g({ dy: -3 }), null, "under the slop it is still a tap");
  assert.equal(g({}), "sheet", "the folded dock drags from anywhere, transcript or not");
  assert.equal(g({ dx: 60, dy: -20 }), "content", "a sideways swipe stays with the content");
  assert.equal(g({ open: true, dy: 40, inHandle: true }), "sheet", "header and composer drag the open sheet");
  assert.equal(g({ open: true, dy: 40, scrollTop: 300 }), "content", "a scrolled transcript scrolls back first");
  assert.equal(g({ open: true, dy: 40, scrollTop: 0 }), "sheet", "at its top, pulling down closes");
  assert.equal(g({ open: true, dy: -40, scrollTop: 0 }), "content", "pushing up at the top scrolls the transcript");
  assert.equal(g({ open: true, dy: 40, scrollTop: null }), "sheet", "outside any scroller the sheet moves");
});
