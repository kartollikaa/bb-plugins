import { test } from "node:test";
import assert from "node:assert/strict";
import { readViewSettings, SETTINGS } from "../src/settings.ts";

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
