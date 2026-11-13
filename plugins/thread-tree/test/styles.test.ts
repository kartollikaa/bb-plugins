import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");
const HAS_SELECTOR = /\bhas-\[|:has\(/;

test("sidebar classes use no :has() selector, which restyles the whole page on every DOM change", () => {
  const offenders = readdirSync(SRC)
    .filter((file) => /\.tsx?$/.test(file))
    .flatMap((file) =>
      readFileSync(join(SRC, file), "utf8")
        .split("\n")
        .flatMap((line, index) => (HAS_SELECTOR.test(line) ? [`src/${file}:${index + 1}`] : [])),
    );
  assert.deepEqual(offenders, []);
});

test("rows take their hover tint from ROW_TINT instead of spelling it again", () => {
  const offenders = readdirSync(SRC)
    .filter((file) => /\.tsx?$/.test(file) && file !== "rowStyles.ts")
    .flatMap((file) =>
      readFileSync(join(SRC, file), "utf8")
        .split("\n")
        .flatMap((line, index) => (/hover:bg-sidebar-accent\/60/.test(line) ? [`src/${file}:${index + 1}`] : [])),
    );
  assert.deepEqual(offenders, []);
});
