import { test } from "node:test";
import assert from "node:assert/strict";
import { createOwnerCache, createThreadNavigation, knownOwner, plainClick, threadLink } from "../src/navigation.ts";

test("a ready index routes roots and descendants to the nearest owner without a server call", () => {
  const roots = new Set(["thr_root", "thr_nested"]);
  const parents = new Map([["thr_root", null], ["thr_child", "thr_root"], ["thr_nested", "thr_root"], ["thr_leaf", "thr_nested"], ["thr_normal", null]]);
  assert.equal(knownOwner("thr_root", roots, parents), "thr_root");
  assert.equal(knownOwner("thr_child", roots, parents), "thr_root");
  assert.equal(knownOwner("thr_leaf", roots, parents), "thr_nested");
  assert.equal(knownOwner("thr_normal", roots, parents), null);
});

test("missing ancestry, an unready index and cycles require authoritative resolution", () => {
  const roots = new Set(["thr_root"]);
  assert.equal(knownOwner("thr_root", null, new Map()), undefined);
  assert.equal(knownOwner("thr_archived", roots, new Map()), undefined);
  assert.equal(knownOwner("thr_child", roots, new Map([["thr_child", "thr_missing"]])), undefined);
  assert.equal(knownOwner("thr_a", roots, new Map([["thr_a", "thr_b"], ["thr_b", "thr_a"]])), undefined);
  assert.equal(knownOwner("thr_root", roots, new Map()), "thr_root");
});

test("only same-origin conversation links qualify, leaving message links and other pages alone", () => {
  const base = "http://localhost:38886/projects/proj_p/threads/thr_current";
  assert.equal(threadLink("/projects/proj_p/threads/thr_root", base), "thr_root");
  for (const href of ["https://other.test/projects/proj_p/threads/thr_root", "/projects/proj_p/threads/thr_root?message=m1", "/projects/proj_p/threads/thr_root#m1", "/projects/proj_p", "/plugins/orchestration/orchestrator/thr_root", "/projects/proj_p/threads/thr_root/events"]) {
    assert.equal(threadLink(href, base), null, href);
  }
});

test("modified, secondary, download, new-window and handled clicks keep native behavior", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
  assert.equal(plainClick(click, "", false), true);
  assert.equal(plainClick(click, "_self", false), true);
  for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"]) assert.equal(plainClick({ ...click, [key]: true }, "", false), false);
  assert.equal(plainClick({ ...click, button: 1 }, "", false), false);
  assert.equal(plainClick(click, "_blank", false), false);
  assert.equal(plainClick(click, "", true), false);
});

function fixture() {
  const opened: string[] = [];
  const resolvers = new Map<string, (owner: string | null) => void>();
  let enabled = true;
  let source = "start";
  let calls = 0;
  const navigation = createThreadNavigation({
    enabled: () => enabled,
    owner: (id) => id === "thr_root" ? id : id === "thr_normal" ? null : undefined,
    resolve: (id) => { calls++; return new Promise((resolve) => resolvers.set(id, resolve)); },
    location: () => source,
    openView: (owner, id) => opened.push(`view:${owner}:${id}`),
    openChat: (id) => opened.push(`chat:${id}`),
  });
  return { navigation, opened, resolvers, calls: () => calls, disable: () => { enabled = false; }, leave: () => { source = "elsewhere"; } };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("known owners open synchronously and normal chats and optouts are left to the host", () => {
  const f = fixture();
  assert.equal(f.navigation.open("thr_root"), true);
  assert.deepEqual(f.opened, ["view:thr_root:thr_root"]);
  assert.equal(f.calls(), 0);
  assert.equal(f.navigation.open("thr_normal"), false);
  f.disable();
  assert.equal(f.navigation.open("thr_root"), false);
  assert.equal(f.calls(), 0);
});

test("unknown archived children resolve before any navigation, then open beside their owner", async () => {
  const f = fixture();
  assert.equal(f.navigation.open("thr_archived"), true);
  assert.deepEqual(f.opened, []);
  f.resolvers.get("thr_archived")!("thr_root");
  await flush();
  assert.deepEqual(f.opened, ["view:thr_root:thr_archived"]);
});

test("unknown ordinary conversations open normally after the authoritative answer", async () => {
  const f = fixture();
  f.navigation.open("thr_unknown");
  assert.deepEqual(f.opened, []);
  f.resolvers.get("thr_unknown")!(null);
  await flush();
  assert.deepEqual(f.opened, ["chat:thr_unknown"]);
});

test("hover and focus preload deduplicates in-flight and recently completed lookups", async () => {
  const f = fixture();
  f.navigation.preload("thr_archived");
  f.navigation.preload("thr_archived");
  assert.equal(f.calls(), 1);
  f.resolvers.get("thr_archived")!("thr_root");
  await flush();
  f.navigation.open("thr_archived");
  await flush();
  assert.equal(f.calls(), 1);
  assert.deepEqual(f.opened, ["view:thr_root:thr_archived"]);
});

test("a later click, cancellation or changed source route prevents stale redirects", async () => {
  for (const cancel of [(f: ReturnType<typeof fixture>) => f.navigation.open("thr_normal"), (f: ReturnType<typeof fixture>) => f.navigation.cancel(), (f: ReturnType<typeof fixture>) => f.leave()]) {
    const f = fixture();
    f.navigation.open("thr_slow");
    cancel(f);
    f.resolvers.get("thr_slow")!("thr_root");
    await flush();
    assert.deepEqual(f.opened, []);
  }
});

test("an unavailable lookup falls back to the requested conversation", async () => {
  const opened: string[] = [];
  const navigation = createThreadNavigation({ enabled: () => true, owner: () => undefined, resolve: async () => { throw new Error("offline"); }, location: () => "start", openView: () => opened.push("view"), openChat: (id) => opened.push(id) });
  navigation.open("thr_unknown");
  await flush();
  assert.deepEqual(opened, ["thr_unknown"]);
});

test("a history cancellation stays cancelled after returning to the original source", async () => {
  const f = fixture();
  f.navigation.open("thr_slow");
  f.navigation.cancel();
  f.resolvers.get("thr_slow")!("thr_root");
  await flush();
  assert.deepEqual(f.opened, []);
});

test("authoritative lookup results are reusable by the destination and expire, including negatives", () => {
  let now = 0;
  const cache = createOwnerCache(() => now);
  cache.set("thr_archived", "thr_root");
  cache.set("thr_plain", null);
  assert.equal(cache.get("thr_archived"), "thr_root");
  assert.equal(cache.get("thr_plain"), null);
  now = 5_000;
  assert.equal(cache.get("thr_archived"), undefined);
  assert.equal(cache.get("thr_plain"), undefined);
  for (let i = 0; i < 65; i++) cache.set(`thr_${i}`, "thr_root");
  assert.equal(cache.get("thr_0"), undefined);
  assert.equal(cache.get("thr_64"), "thr_root");
});

test("captured links let sidebar cleanup run before navigation and remain cancellable", async () => {
  const f = fixture();
  assert.equal(f.navigation.open("thr_root", true), true);
  assert.equal(f.opened.length, 0);
  f.opened.push("sidebar closed");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(f.opened, ["sidebar closed", "view:thr_root:thr_root"]);
  f.navigation.open("thr_root", true);
  f.navigation.cancel();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(f.opened, ["sidebar closed", "view:thr_root:thr_root"]);
});

test("a preloaded archived link also waits for sidebar cleanup beyond promise callbacks", async () => {
  const f = fixture();
  f.navigation.preload("thr_archived");
  f.resolvers.get("thr_archived")!("thr_root");
  await flush();
  assert.equal(f.navigation.open("thr_archived", true), true);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(f.opened.length, 0);
  f.opened.push("sidebar closed");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(f.opened, ["sidebar closed", "view:thr_root:thr_archived"]);
});
