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
