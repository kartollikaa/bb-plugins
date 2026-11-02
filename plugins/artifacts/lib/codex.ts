import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Artifact, SourceList } from "./contract";

const APPS_MCP = "https://chatgpt.com/backend-api/wham/apps";
const PAGE_LIMIT = 50;
const MAX_PAGES = 6;

export type CodexAuth = { accessToken: string; accountId: string | null };

/** `~/.codex/auth.json` after a ChatGPT sign-in. */
export function parseAuth(raw: string): CodexAuth | null {
  try {
    const tokens = JSON.parse(raw)?.tokens;
    if (typeof tokens?.access_token !== "string" || tokens.access_token === "") return null;
    return { accessToken: tokens.access_token, accountId: typeof tokens.account_id === "string" ? tokens.account_id : null };
  } catch {
    return null;
  }
}

export async function readCodexAuth(home = process.env.CODEX_HOME ?? join(homedir(), ".codex")): Promise<CodexAuth | null> {
  try {
    return parseAuth(await readFile(join(home, "auth.json"), "utf8"));
  } catch {
    return null;
  }
}

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const pick = (record: Record<string, unknown>, keys: string[]) => keys.map((key) => str(record[key])).find((value) => value !== null) ?? null;

/** An MCP answer arrives as plain JSON or as one SSE `data:` line. */
export function parseRpcBody(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const data = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.startsWith("{"));
  if (data.length === 0) throw new Error("unexpected response");
  return JSON.parse(data[data.length - 1]);
}

/** The tool result's payload: `structuredContent`, else the JSON in its first text block. */
export function toolPayload(result: unknown): unknown {
  const record = result as { structuredContent?: unknown; content?: { type?: string; text?: string }[]; isError?: boolean };
  const text = record?.content?.find((block) => block.type === "text")?.text;
  if (record?.isError) throw new Error(text?.slice(0, 200) || "Sites refused the request");
  if (record?.structuredContent !== undefined) return record.structuredContent;
  if (text === undefined) throw new Error("unexpected response");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 200));
  }
}

function findArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown> | null;
  for (const key of ["items", "sites"]) if (Array.isArray(record?.[key])) return record[key] as unknown[];
  throw new Error("unexpected response");
}

export function nextCursor(payload: unknown): string | null {
  const record = payload as Record<string, unknown> | null;
  return record ? pick(record, ["cursor", "next_cursor"]) : null;
}

const ACCESS_LABEL: Record<string, string> = {
  private: "Private",
  owner: "Private",
  public: "Public",
  workspace: "Workspace",
  workspace_all: "Workspace",
  custom: "Custom access",
};

/** `sites_list_sites` items; a Site without a live or preview URL has nothing to open yet. */
export function parseSites(payload: unknown): Artifact[] {
  return findArray(payload).flatMap((entry): Artifact[] => {
    const site = (entry ?? {}) as Record<string, unknown>;
    const id = pick(site, ["id", "project_id"]);
    const url = pick(site, ["current_live_url", "current_preview_url", "url"]);
    if (id === null || url === null || !url.startsWith("https://")) return [];
    const access = pick(site, ["access_mode"]);
    const title = pick(site, ["title", "slug"]) ?? url;
    const description = pick(site, ["description"]);
    return [
      {
        id,
        title,
        url,
        updatedAt: pick(site, ["updated_at", "created_at"]),
        description: description === title ? null : description,
        detail: site.disabled_by ? "Disabled" : access ? (ACCESS_LABEL[access] ?? access) : null,
        starred: false,
        thumbnail: pick(site, ["screenshot_url"]),
        thumbnailDark: null,
      },
    ];
  });
}

export async function fetchCodexSites(auth: CodexAuth | null, fetchImpl: typeof fetch = fetch): Promise<SourceList> {
  if (auth === null) return { items: [], error: "No ChatGPT sign-in in ~/.codex/auth.json. Sign in to Codex first." };
  let sessionId: string | null = null;
  let id = 0;
  const post = async (method: string, params: unknown, notification = false) => {
    const response = await fetchImpl(APPS_MCP, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        ...(auth.accountId ? { "ChatGPT-Account-ID": auth.accountId } : {}),
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: ++id, method, params }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("ChatGPT refused the Codex login. Open Codex once so it refreshes its login.");
    }
    if (!response.ok) throw new Error(`ChatGPT answered HTTP ${response.status}`);
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    if (notification) return null;
    const body = parseRpcBody(await response.text()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? "MCP error");
    return body.result;
  };

  await post("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bb-artifacts", version: "0.1.0" } });
  await post("notifications/initialized", {}, true);
  const items: Artifact[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const payload = toolPayload(
      await post("tools/call", { name: "sites_list_sites", arguments: { limit: PAGE_LIMIT, ...(cursor ? { cursor } : {}) } }),
    );
    items.push(...parseSites(payload));
    cursor = nextCursor(payload);
    if (cursor === null) break;
  }
  return { items: items.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")), error: null };
}
