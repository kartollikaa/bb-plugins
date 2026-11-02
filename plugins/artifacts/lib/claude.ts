import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Artifact, SourceList } from "./contract";

export const API = "https://api.anthropic.com";
const FRAMES_URL = `${API}/api/frame/frames?thumb=1&limit=200`;
const KEYCHAIN_SERVICE = "Claude Code-credentials";
export const artifactUrl = (slug: string) => `https://claude.ai/code/artifact/${encodeURIComponent(slug)}`;

export type ClaudeCredentials = { accessToken: string; expiresAt: number | null };

/** The `claudeAiOauth` block Claude Code keeps in the login keychain. */
export function parseCredentials(raw: string): ClaudeCredentials | null {
  try {
    const oauth = JSON.parse(raw)?.claudeAiOauth;
    if (typeof oauth?.accessToken !== "string" || oauth.accessToken === "") return null;
    return { accessToken: oauth.accessToken, expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : null };
  } catch {
    return null;
  }
}

/** `security` exits 44 when the item is missing. */
const ITEM_NOT_FOUND = 44;

export async function readKeychainCredentials(): Promise<ClaudeCredentials | null> {
  try {
    const { stdout } = await promisify(execFile)("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], {
      timeout: 10_000,
    });
    return parseCredentials(stdout.trim());
  } catch (error) {
    if ((error as { code?: unknown }).code === ITEM_NOT_FOUND) return null;
    throw new Error(`Couldn't read the Claude Code login from the keychain: ${message(error)}`);
  }
}

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

const absolute = (url: string | null) => (url === null ? null : url.startsWith("/") ? `${API}${url}` : url.startsWith("https://") ? url : null);

const AUDIENCE_LABEL: Record<string, string> = { public: "Public", owner: "Private", private: "Private", org: "Organization", users: "Shared" };

/** `GET /api/frame/frames`: the artifacts this account published, newest first. */
export function parseFrames(body: unknown): Artifact[] {
  const frames = (body as { frames?: unknown })?.frames;
  if (!Array.isArray(frames)) throw new Error("Claude sent an unexpected artifact list");
  const items: Artifact[] = [];
  for (const frame of frames) {
    const slug = str(frame?.slug);
    if (slug === null || frame.softDeleted === true) continue;
    const audience = str(frame.audience);
    const title = str(frame.title) ?? slug;
    const description = str(frame.description);
    items.push({
      id: slug,
      title,
      url: artifactUrl(slug),
      updatedAt: str(frame.updatedAt) ?? str(frame.created_at),
      description: description === title ? null : description,
      detail: audience ? (AUDIENCE_LABEL[audience] ?? audience) : null,
      starred: frame.starred === true,
      thumbnail: absolute(str(frame.thumbImgURL)),
      thumbnailDark: absolute(str(frame.thumbDarkImgURL)),
    });
  }
  return items.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

/** Without the X-Frame headers Claude Code sends, the frames API answers 404. */
const HEADERS = {
  Accept: "application/json, application/vnd.ant.frame-refusal+json",
  "anthropic-beta": "oauth-2025-04-20",
  "X-Frame-CP": "go",
  "X-Frame-Surface": "code",
  "X-Frame-Platform": "cli",
  "X-Frame-Client-Version": "2.1.316",
};

export async function fetchClaude(
  credentials: ClaudeCredentials | null,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<SourceList> {
  if (credentials === null) return { items: [], error: "No Claude Code login in the keychain. Sign in with `claude` first." };
  if (credentials.expiresAt !== null && credentials.expiresAt < now) {
    return { items: [], error: "The Claude Code login has expired. Open Claude Code once so it refreshes." };
  }
  const response = await fetchImpl(FRAMES_URL, {
    headers: { ...HEADERS, Authorization: `Bearer ${credentials.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) {
    return { items: [], error: "Claude refused the Claude Code login. Open Claude Code once so it refreshes." };
  }
  if (!response.ok) return { items: [], error: `Claude answered HTTP ${response.status}` };
  return { items: parseFrames(await response.json()), error: null };
}

export const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
