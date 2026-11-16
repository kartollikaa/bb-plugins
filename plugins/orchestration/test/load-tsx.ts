import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const modules = new Map<string, string>();

/** A data: URL of the transpiled module; relative .tsx imports are transpiled the same way, other specifiers resolve to files. */
function moduleUrl(source: URL): string {
  const cached = modules.get(source.href);
  if (cached) return cached;
  const require = createRequire(source);
  const result = ts.transpileModule(readFileSync(source, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } });
  const code = result.outputText.replace(/from ["']([^"']+)["']/g, (_, specifier: string) => {
    if (specifier.startsWith(".") && specifier.endsWith(".tsx")) return `from ${JSON.stringify(moduleUrl(new URL(specifier, source)))}`;
    const url = specifier.startsWith(".") ? new URL(specifier, source).href : pathToFileURL(require.resolve(specifier)).href;
    return `from ${JSON.stringify(url)}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  modules.set(source.href, url);
  return url;
}

export async function loadTsx(source: URL) {
  return import(moduleUrl(source));
}
