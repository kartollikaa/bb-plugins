import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rename, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSource } from "../file.ts";
import { configSchema } from "../schema.ts";
test("real JSON, atomic replacement, partial JSON, removal and symlink/traversal escape", async () => {
  const root = await mkdtemp(join(tmpdir(), "live-ui-"));
  try {
    const file = join(root, "report.json");
    await writeFile(
      file,
      JSON.stringify({ metrics: [{ label: "Builds", value: 3 }] }),
    );
    const first = await readFileSource(root, "report.json");
    assert.equal(first.report?.metrics?.[0]?.value, 3);
    await writeFile(
      join(root, "next"),
      JSON.stringify({ metrics: [{ label: "Builds", value: 4 }] }),
    );
    await rename(join(root, "next"), file);
    const next = await readFileSource(root, "report.json");
    assert.notEqual(first.revision, next.revision);
    assert.equal(next.report?.metrics?.[0]?.value, 4);
    await writeFile(file, '{"metrics":');
    assert.equal(
      (await readFileSource(root, "report.json")).error,
      "Invalid or partial JSON",
    );
    await rm(file);
    assert.equal(
      (await readFileSource(root, "report.json")).error,
      "Source removed",
    );
    await symlink("/etc/passwd", file);
    assert.equal((await readFileSource(root, "report.json")).revoked, true);
    assert.equal((await readFileSource(root, "../escape")).revoked, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("payload and row limits; no executable configuration", async () => {
  assert.equal(
    configSchema.safeParse({
      source: { root: "storage", path: "x.json" },
      view: "Table",
    }).success,
    true,
  );
  for (const path of ["../x", "/etc/passwd", "a/../b", "a\\b"])
    assert.equal(
      configSchema.safeParse({
        source: { root: "storage", path },
        view: "Table",
      }).success,
      false,
    );
  assert.equal(
    configSchema.safeParse({
      source: { root: "storage", path: "x" },
      view: "Table",
      eval: "alert(1)",
    }).success,
    false,
  );
  const root = await mkdtemp(join(tmpdir(), "live-ui-"));
  try {
    await writeFile(
      join(root, "x"),
      JSON.stringify({ table: { columns: ["a"], rows: Array(201).fill([1]) } }),
    );
    assert.match((await readFileSource(root, "x")).error!, /schema/);
    await writeFile(join(root, "x"), " ".repeat(262145));
    assert.match((await readFileSource(root, "x")).error!, /256 KiB/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("opened file identity rejects a parent-directory swap restored before canonical recheck", async () => {
  const { mkdir, open, realpath } = await import("node:fs/promises");
  const root = await realpath(await mkdtemp(join(tmpdir(), "live-ui-race-")));
  const outside = await realpath(
    await mkdtemp(join(tmpdir(), "live-ui-outside-")),
  );
  try {
    await mkdir(join(root, "reports"));
    await writeFile(
      join(root, "reports", "x.json"),
      '{"metrics":[{"label":"safe","value":1}]}',
    );
    await writeFile(
      join(outside, "x.json"),
      '{"metrics":[{"label":"private","value":900}]}',
    );
    const swappedOpen: typeof open = async (path, flags, mode) => {
      await rename(join(root, "reports"), join(root, "saved"));
      await symlink(outside, join(root, "reports"));
      const fd = await open(path, flags, mode);
      await rm(join(root, "reports"));
      await rename(join(root, "saved"), join(root, "reports"));
      return fd;
    };
    const result = await readFileSource(root, "reports/x.json", swappedOpen);
    assert.equal(result.revoked, true);
    assert.equal(result.report, null);
    assert.equal(
      (await readFileSource(root, "reports/x.json")).report?.metrics?.[0].value,
      1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
