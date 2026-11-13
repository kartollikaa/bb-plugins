import { test } from "node:test";
import assert from "node:assert/strict";
import { moveSection, readViewSettings, resolveSectionOrder, SETTINGS, shownSectionIds } from "../src/settings.ts";

test("missing values fall back to every descriptor's default", () => {
  const view = readViewSettings(undefined);
  for (const [key, descriptor] of Object.entries(SETTINGS)) {
    assert.equal(view[key as keyof typeof view], descriptor.default, key);
  }
});

test("valid values pass through", () => {
  const view = readViewSettings({ showGithub: false, showAge: false, recentLimit: 3, recentMoreLimit: 8 });
  assert.equal(view.showGithub, false);
  assert.equal(view.showAge, false);
  assert.equal(view.recentLimit, 3);
  assert.equal(view.recentMoreLimit, 8);
  assert.equal(view.showRecent, true);
});

test("wrong types and out-of-range counts are replaced by defaults", () => {
  const view = readViewSettings({ showGithub: "no", recentLimit: 0, recentMoreLimit: 2.5 });
  assert.equal(view.showGithub, true);
  assert.equal(view.recentLimit, 5);
  assert.equal(view.recentMoreLimit, 15);
});

test("Show more never shows fewer rows than the first page", () => {
  assert.equal(readViewSettings({ recentLimit: 20, recentMoreLimit: 10 }).recentMoreLimit, 20);
});

test("a saved section order drops unknown and repeated ids and appends the rest", () => {
  assert.deepEqual(resolveSectionOrder([]), ["github", "automations", "recent"]);
  assert.deepEqual(resolveSectionOrder(["recent", "bogus", "recent", "github"]), ["recent", "github", "automations"]);
});

test("moving a section steps over the next shown one and stops at the ends", () => {
  const order = ["github", "automations", "recent"] as const;
  assert.deepEqual(moveSection(order, order, "recent", -1), ["github", "recent", "automations"]);
  assert.deepEqual(moveSection(order, order, "github", -1), ["github", "automations", "recent"]);
  assert.deepEqual(moveSection(order, ["github", "recent"], "github", 1), ["recent", "automations", "github"]);
  assert.deepEqual(moveSection(order, ["github", "recent"], "automations", 1), ["github", "automations", "recent"]);
});

test("a section whose source plugin is absent is not shown even when turned on", () => {
  const view = { showGithub: true, showAutomations: false, showRecent: true };
  assert.deepEqual(shownSectionIds(["github", "automations", "recent"], view, ["github", "automations", "recent"]), ["github", "recent"]);
  assert.deepEqual(shownSectionIds(["github", "automations", "recent"], view, ["automations", "recent"]), ["recent"]);
});
