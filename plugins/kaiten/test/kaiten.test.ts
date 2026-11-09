import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DOMAIN,
  buildBoard,
  cardPrompt,
  cardUrl,
  normalizeDomain,
  parseEnvFile,
  resolveCredentials,
  type RawBoard,
  type RawCard,
} from "../lib/kaiten.ts";
import { dueLabel, filterColumns } from "../lib/view.ts";

test("parseEnvFile reads exports, quotes and comments", () => {
  const env = parseEnvFile(`# c\nKAITEN_TOKEN="abc def"\nexport KAITEN_TEAM=core # note\n\nbad line\nX='1'`);
  assert.deepEqual(env, { KAITEN_TOKEN: "abc def", KAITEN_TEAM: "core", X: "1" });
});

test("normalizeDomain strips scheme and path", () => {
  assert.equal(normalizeDomain(" https://dodopizza.kaiten.ru/api/latest "), "dodopizza.kaiten.ru");
  assert.equal(normalizeDomain(""), "");
});

test("credentials: setting, then env file, then MCP config.json", () => {
  const envFile = "KAITEN_TOKEN=from-env\nKAITEN_DOMAIN=env.kaiten.ru";
  const configJson = JSON.stringify({ url: "https://cfg.kaiten.ru/api/latest", token: "from-config" });
  assert.deepEqual(resolveCredentials({ settingToken: "s", settingDomain: "set.kaiten.ru", envFile, configJson }), { token: "s", domain: "set.kaiten.ru" });
  assert.deepEqual(resolveCredentials({ settingToken: " ", settingDomain: "", envFile, configJson }), { token: "from-env", domain: "env.kaiten.ru" });
  assert.deepEqual(resolveCredentials({ settingToken: undefined, settingDomain: undefined, envFile: null, configJson }), { token: "from-config", domain: "cfg.kaiten.ru" });
  assert.deepEqual(resolveCredentials({ settingToken: undefined, settingDomain: undefined, envFile: "KAITEN_TOKEN=t", configJson: "{broken" }), { token: "t", domain: DEFAULT_DOMAIN });
  assert.equal(resolveCredentials({ settingToken: undefined, settingDomain: undefined, envFile: null, configJson: "{broken" }), null);
});

const raw: RawBoard = {
  id: 7,
  title: "Sprint",
  columns: [
    { id: 3, title: "Done", sort_order: 3, type: 3 },
    {
      id: 1,
      title: "In progress",
      sort_order: 1,
      type: 2,
      subcolumns: [{ id: 11, title: "Coding", sort_order: 1, type: 2 }],
    },
    { id: 2, title: "To do", sort_order: 0.5, type: 1 },
  ],
};
const card = (id: number, column_id: number, sort_order: number, extra: Partial<RawCard> = {}): RawCard => ({
  id,
  title: `Card ${id}`,
  column_id,
  sort_order,
  ...extra,
});

test("buildBoard orders columns and cards, folds sub-columns, drops archived", () => {
  const board = buildBoard(
    raw,
    [
      card(1, 11, 2, { owner: { id: 5, full_name: "Ann" } }),
      card(2, 1, 1),
      card(3, 2, 1, { archived: true }),
      card(4, 99, 1),
      card(5, 3, 1, { members: [{ id: 5, full_name: "Ann" }] }),
    ],
    { domain: "x.kaiten.ru", userId: 5, threads: new Map([[2, "thr_a"]]) },
  );
  assert.deepEqual(board.columns.map((column) => column.title), ["To do", "In progress", "Done"]);
  assert.deepEqual(board.columns[0]!.cards, []);
  const progress = board.columns[1]!.cards;
  assert.deepEqual(progress.map((c) => c.id), [2, 1]);
  assert.equal(progress[1]!.stage, "Coding");
  assert.equal(progress[1]!.mine, true);
  assert.equal(progress[0]!.mine, false);
  assert.equal(progress[0]!.threadId, "thr_a");
  assert.equal(progress[0]!.url, cardUrl("x.kaiten.ru", 2));
  assert.equal(board.columns[2]!.done, true);
  assert.equal(board.columns[2]!.cards[0]!.mine, true);
});

test("filterColumns hides Done, filters mine and text", () => {
  const board = buildBoard(raw, [card(1, 1, 1, { owner: { id: 5, full_name: "Ann" }, tags: [{ name: "ios" }] }), card(2, 1, 2), card(3, 3, 1)], {
    domain: "d",
    userId: 5,
    threads: new Map(),
  });
  const all = filterColumns(board.columns, { mine: false, showDone: false, query: "" });
  assert.deepEqual(all.map((c) => c.title), ["To do", "In progress"]);
  assert.equal(all[1]!.cards.length, 2);
  assert.equal(filterColumns(board.columns, { mine: true, showDone: false, query: "" })[1]!.cards.length, 1);
  assert.equal(filterColumns(board.columns, { mine: false, showDone: false, query: "IOS" })[1]!.cards.length, 1);
  assert.equal(filterColumns(board.columns, { mine: false, showDone: false, query: "2" })[1]!.cards[0]!.id, 2);
  assert.equal(filterColumns(board.columns, { mine: false, showDone: true, query: "" }).length, 3);
});

test("dueLabel flags past days only", () => {
  const now = new Date(2026, 10, 9, 12);
  assert.equal(dueLabel(new Date(2026, 10, 8, 23).toISOString(), now).overdue, true);
  assert.equal(dueLabel(new Date(2026, 10, 9, 1).toISOString(), now).overdue, false);
});

test("cardPrompt carries card, checklist and the latest comments", () => {
  const text = cardPrompt(
    {
      id: 9,
      title: "Fix cart",
      column_id: 1,
      sort_order: 1,
      description: "Cart shows wrong time",
      type: { name: "Bug" },
      owner: { full_name: "Ann" },
      size_text: "3 =",
      tags: [{ name: "ios" }, { name: "cart" }],
      checklists: [{ name: "Steps", items: [{ text: "Repro", checked: true }, { text: "Fix", checked: false }, { checked: true }] }],
    },
    Array.from({ length: 12 }, (_, i) => ({ text: `note ${i}\nline`, author: { full_name: "Bob" } })),
    "x.kaiten.ru",
  );
  assert.match(text, /^Do the Kaiten card #9: Fix cart\nCard: https:\/\/x\.kaiten\.ru\/9\nType: Bug · Owner: Ann · Size: 3 = · Tags: ios, cart/);
  assert.match(text, /Cart shows wrong time/);
  assert.match(text, /## Checklist: Steps\n- \[x\] Repro\n- \[ \] Fix\n/);
  assert.match(text, /- Bob: note 11 line/);
  assert.doesNotMatch(text, /note 1 /);
  assert.match(text, /Don't move the card/);
});

test("cardPrompt marks an empty description", () => {
  const text = cardPrompt({ id: 1, title: "T", column_id: 1, sort_order: 1, description: null }, [], "d");
  assert.match(text, /## Description\n\(empty\)/);
  assert.doesNotMatch(text, /Latest comments|Checklist/);
});
