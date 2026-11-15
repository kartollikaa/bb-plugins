import type { ExperimentalLiveFileTarget } from "@get-bb/plugin-sdk/app";

export function localEvidencePath(href: string, sourcePath: string): string | null {
  if (!href || href.startsWith("#") || href.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("file:")) return null;
  try {
    const base = new URL("file:///");
    base.pathname = sourcePath;
    const url = new URL(href, base);
    if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost")) return null;
    const path = decodeURIComponent(url.pathname);
    return path.includes("\0") ? null : path;
  } catch {
    return null;
  }
}

export function evidenceTarget(path: string, hostId: string | null, threadId: string, workspace: { environmentId: string; rootPath: string; storageRootPath: string | null } | null): ExperimentalLiveFileTarget | null {
  if (workspace?.storageRootPath && path.startsWith(`${workspace.storageRootPath}/`))
    return { kind: "thread-storage", threadId, path: path.slice(workspace.storageRootPath.length + 1) };
  if (workspace && path.startsWith(`${workspace.rootPath}/`))
    return { kind: "workspace", environmentId: workspace.environmentId, path: path.slice(workspace.rootPath.length + 1) };
  return hostId ? { kind: "host", hostId, path } : null;
}
