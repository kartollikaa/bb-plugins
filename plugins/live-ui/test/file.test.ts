import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  rename,
  symlink,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSource } from "../file.ts";
import { configSchema } from "../schema.ts";
test("real JSON, atomic replacement, partial JSON, removal and symlink/traversal escape", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "live-ui-")));
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
  const root = await realpath(await mkdtemp(join(tmpdir(), "live-ui-")));
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

test("directory handles survive swaps at both open and final metadata check", async () => {
  const { spawnSync } = await import("node:child_process");
  const { readerProgram } = await import("../read-helper.ts");
  const probe = String.raw`
import os, json, sys, tempfile, shutil, base64
ns={'__name__':'probe'}
exec(json.loads(sys.stdin.read())['program'],ns)
root=os.path.realpath(tempfile.mkdtemp(prefix='live-ui-race-'))
outside=os.path.realpath(tempfile.mkdtemp(prefix='live-ui-external-'))
parent=os.path.join(root,'reports')
os.mkdir(parent)
with open(os.path.join(parent,'x.json'),'w') as f: f.write('{"metrics":[{"label":"safe","value":1}]}')
with open(os.path.join(outside,'x.json'),'w') as f: f.write('{"metrics":[{"label":"private","value":900}]}')
swaps=0
def swap():
    global swaps
    os.rename(parent,parent+'.saved');os.symlink(outside,parent);swaps+=1
def restore():
    os.unlink(parent);os.rename(parent+'.saved',parent)
def opener(name,flags,dir_fd=None):
    if name == 'x.json':
        swap()
        try: return os.open(name,flags,dir_fd=dir_fd)
        finally: restore()
    return os.open(name,flags,dir_fd=dir_fd)
def statter(fd):
    swap()
    try: return os.fstat(fd)
    finally: restore()
try:
    result=ns['read_source'](root,'reports/x.json',opener,statter)
    payload=json.loads(base64.b64decode(result['data']))
    print(json.dumps({'value':payload['metrics'][0]['value'],'swaps':swaps,'revoked':result['revoked']}))
finally:
    shutil.rmtree(root);shutil.rmtree(outside)
`;
  const result = spawnSync("python3", ["-I", "-c", probe], {
    input: JSON.stringify({ program: readerProgram }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    value: 1,
    swaps: 2,
    revoked: false,
  });
});

test("missing secure reader fails closed and hides cached source data", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "live-ui-no-python-")),
  );
  try {
    await writeFile(
      join(root, "r.json"),
      '{"metrics":[{"label":"safe","value":1}]}',
    );
    assert.equal(
      (await readFileSource(root, "r.json")).report?.metrics?.[0].value,
      1,
    );
    const previous = process.env.PATH;
    try {
      process.env.PATH = root;
      const result = await readFileSource(root, "r.json");
      assert.equal(result.report, null);
      assert.equal(result.revoked, true);
      assert.match(result.error!, /requires Python 3/);
    } finally {
      if (previous === undefined) delete process.env.PATH;
      else process.env.PATH = previous;
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cancelling a host read cancels the fixed reader without returning file data", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "live-ui-abort-")));
  try {
    await writeFile(
      join(root, "r.json"),
      '{"metrics":[{"label":"safe","value":1}]}',
    );
    const controller = new AbortController();
    const read = readFileSource(root, "r.json", controller.signal);
    controller.abort();
    const result = await read;
    assert.equal(result.report, null);
    assert.equal(result.error, "Source read cancelled");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
