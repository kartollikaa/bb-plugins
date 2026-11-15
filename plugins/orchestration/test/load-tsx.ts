import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export async function loadTsx(source: URL) {
  const require = createRequire(source);
  const result = ts.transpileModule(readFileSync(source, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } });
  const code = result.outputText.replace(/from ["']([^"']+)["']/g, (_, specifier: string) => {
    const url = specifier.startsWith(".") ? new URL(specifier, source).href : pathToFileURL(require.resolve(specifier)).href;
    return `from ${JSON.stringify(url)}`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
