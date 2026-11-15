import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
test("standalone package uses public SDK and package-local imports only", () => {
  const scan = experimental_scanPublicSdkOnly(
    fileURLToPath(new URL("..", import.meta.url)),
    { allow: [/^react(?:\/.*)?$/] },
  );
  assert.deepEqual(scan.violations, []);
  assert.deepEqual(scan.privateDependencies, []);
  assert.ok(scan.files.includes("server.ts"));
  assert.ok(scan.files.includes("host.ts"));
  assert.ok(scan.files.includes("app.tsx"));
});
