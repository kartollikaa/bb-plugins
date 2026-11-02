import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchClaude, parseCredentials, parseFrames } from "../lib/claude.ts";
import { fetchCodexSites, nextCursor, parseAuth, parseRpcBody, parseSites, toolPayload } from "../lib/codex.ts";
import { formatList, relativeTime } from "../lib/format.ts";
import { matches } from "../lib/filter.ts";
import { findByUrl, urlKey } from "../lib/lookup.ts";

test("claude credentials come from the claudeAiOauth block", () => {
  assert.deepEqual(parseCredentials(JSON.stringify({ claudeAiOauth: { accessToken: "t", expiresAt: 5 } })), { accessToken: "t", expiresAt: 5 });
  assert.equal(parseCredentials(JSON.stringify({ claudeAiOauth: {} })), null);
  assert.equal(parseCredentials("not json"), null);
});

test("frames: drops deleted ones, newest first, audience label, links to claude.ai", () => {
  const items = parseFrames({
    frames: [
      { slug: "a", title: "Old", description: "Old", audience: "owner", updatedAt: "2026-10-01T00:00:00Z" },
      { slug: "b", title: "Gone", softDeleted: true },
      { slug: "c", description: "Deck for review", updatedAt: "2026-11-01T00:00:00Z", starred: true },
      { title: "no slug" },
    ],
    starsEnabled: true,
  });
  assert.deepEqual(
    items.map((item) => [item.id, item.title, item.description, item.detail, item.starred]),
    [
      ["c", "c", "Deck for review", null, true],
      ["a", "Old", null, "Private", false],
    ],
  );
  assert.equal(items[1].url, "https://claude.ai/code/artifact/a");
  assert.throws(() => parseFrames({}), /unexpected/);
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

test("fetchClaude sends the OAuth token and the X-Frame headers", async () => {
  let seen: { url: string; headers: Headers } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url, headers: new Headers(init.headers) };
    return jsonResponse({ frames: [{ slug: "x", title: "X" }] });
  }) as unknown as typeof fetch;
  const result = await fetchClaude({ accessToken: "tok", expiresAt: null }, fake);
  assert.deepEqual(result, { items: [{ id: "x", title: "X", url: "https://claude.ai/code/artifact/x", updatedAt: null, description: null, detail: null, starred: false, thumbnail: null, thumbnailDark: null }], error: null });
  assert.equal(seen!.url, "https://api.anthropic.com/api/frame/frames?thumb=1&limit=200");
  assert.equal(seen!.headers.get("authorization"), "Bearer tok");
  assert.equal(seen!.headers.get("x-frame-cp"), "go");
  assert.equal(seen!.headers.get("x-frame-surface"), "code");
});

test("fetchClaude explains a refused or expired login", async () => {
  const refused = (async () => jsonResponse({}, 401)) as unknown as typeof fetch;
  assert.match((await fetchClaude({ accessToken: "t", expiresAt: null }, refused)).error ?? "", /refused/);
  assert.match((await fetchClaude({ accessToken: "t", expiresAt: 1 }, refused, 2)).error ?? "", /expired/);
  assert.match((await fetchClaude(null, refused)).error ?? "", /No Claude Code login/);
  const missing = (async () => jsonResponse({}, 404)) as unknown as typeof fetch;
  assert.match((await fetchClaude({ accessToken: "t", expiresAt: null }, missing)).error ?? "", /HTTP 404/);
});

test("codex auth reads tokens.access_token and account_id", () => {
  assert.deepEqual(parseAuth(JSON.stringify({ tokens: { access_token: "a", account_id: "acc" } })), { accessToken: "a", accountId: "acc" });
  assert.equal(parseAuth(JSON.stringify({ OPENAI_API_KEY: "sk" })), null);
});

test("MCP bodies: JSON or SSE", () => {
  assert.deepEqual(parseRpcBody('{"result":1}'), { result: 1 });
  assert.deepEqual(parseRpcBody('event: message\ndata: {"result":2}\n\n'), { result: 2 });
  assert.throws(() => parseRpcBody("event: ping\n"), /unexpected/);
});

test("tool payload prefers structuredContent, falls back to text JSON, raises tool errors", () => {
  assert.deepEqual(toolPayload({ structuredContent: { items: [] }, content: [] }), { items: [] });
  assert.deepEqual(toolPayload({ content: [{ type: "text", text: '{"items": [1], "cursor": null}' }] }), { items: [1], cursor: null });
  assert.throws(() => toolPayload({ isError: true, content: [{ type: "text", text: "workspace_required" }] }), /workspace_required/);
});

test("sites: live URL first, preview as fallback, access label, cursor", () => {
  const payload = {
    items: [
      {
        id: "appgprj_1",
        title: "Weekend merge list",
        description: "PR queue",
        current_live_url: "https://merge.it-space.chatgpt.site",
        current_preview_url: null,
        access_mode: "custom",
        disabled_by: null,
        updated_at: "2026-11-01T00:00:00+00:00",
      },
      { id: "appgprj_2", title: "Draft", current_live_url: null, current_preview_url: null },
      { id: "appgprj_3", slug: "preview-only", current_live_url: null, current_preview_url: "https://p.chatgpt.site", disabled_by: "admin" },
    ],
    cursor: "c2",
  };
  assert.deepEqual(
    parseSites(payload).map((site) => [site.id, site.title, site.url, site.detail]),
    [
      ["appgprj_1", "Weekend merge list", "https://merge.it-space.chatgpt.site", "Custom access"],
      ["appgprj_3", "preview-only", "https://p.chatgpt.site", "Disabled"],
    ],
  );
  assert.equal(nextCursor(payload), "c2");
  assert.equal(nextCursor({ items: [], cursor: null }), null);
});

test("fetchCodexSites runs initialize, then pages through sites_list_sites", async () => {
  const calls: { method: string; args?: unknown; session: string | null; account: string | null }[] = [];
  const fake = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const headers = new Headers(init.headers);
    calls.push({ method: body.method, args: body.params?.arguments, session: headers.get("mcp-session-id"), account: headers.get("chatgpt-account-id") });
    if (body.method === "initialize") return jsonResponse({ jsonrpc: "2.0", id: body.id, result: {} }, 200, { "mcp-session-id": "s1" });
    if (body.method === "notifications/initialized") return jsonResponse("", 202);
    const page = body.params.arguments.cursor === "c2" ? 2 : 1;
    const structuredContent = {
      items: [{ id: `p${page}`, title: `Site ${page}`, current_live_url: `https://s${page}.chatgpt.site`, updated_at: `2026-1${page}-01` }],
      cursor: page === 1 ? "c2" : null,
    };
    return jsonResponse(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent } })}\n\n`);
  }) as unknown as typeof fetch;
  const result = await fetchCodexSites({ accessToken: "a", accountId: "acc" }, fake);
  assert.deepEqual(result.items.map((site) => site.id), ["p2", "p1"]);
  assert.deepEqual(calls.map((call) => call.method), ["initialize", "notifications/initialized", "tools/call", "tools/call"]);
  assert.equal(calls[0].session, null);
  assert.ok(calls.slice(1).every((call) => call.session === "s1" && call.account === "acc"));
});

test("fetchCodexSites names a refused login", async () => {
  const refused = (async () => jsonResponse({}, 401)) as unknown as typeof fetch;
  await assert.rejects(fetchCodexSites({ accessToken: "a", accountId: null }, refused), /refused the Codex login/);
  assert.match((await fetchCodexSites(null, refused)).error ?? "", /auth\.json/);
});

test("formatList prints both sources with their errors", () => {
  const text = formatList({
    claude: { items: [{ id: "a", title: "Deck", url: "https://claude.ai/code/artifact/a", updatedAt: "2026-11-01T10:00:00Z", description: null, detail: null, starred: false }], error: null },
    codex: { items: [], error: "boom" },
    fetchedAt: 1,
  });
  assert.match(text, /Claude Code artifacts:\n {2}2026-11-01 {2}Deck/);
  assert.match(text, /Codex Sites:\n {2}! boom/);
});

test("relative time and filter", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(relativeTime("2026-11-02T09:00:00Z", now), "3 h ago");
  assert.equal(relativeTime("2026-09-01T00:00:00Z", now), "2026-09-01");
  assert.equal(relativeTime(null, now), "");
  const item = { id: "a", title: "Weekend merge list", url: "https://merge.chatgpt.site", updatedAt: null, description: "Drinkit PRs", detail: null, starred: false };
  assert.ok(matches(item, "merge WEEK"));
  assert.ok(matches(item, "drinkit"));
  assert.ok(!matches(item, "deck"));
});

test("frames: thumbnails become absolute API URLs, non-https ones are dropped", () => {
  const [item] = parseFrames({ frames: [{ slug: "a", thumbImgURL: "/_f/a/_thumb.img", thumbDarkImgURL: "http://x/t.img" }] });
  assert.equal(item.thumbnail, "https://api.anthropic.com/_f/a/_thumb.img");
  assert.equal(item.thumbnailDark, null);
});

test("chat cards find an item by URL, ignoring trailing slash, query and host case", () => {
  const base = { updatedAt: null, description: null, detail: null, starred: false, thumbnail: null, thumbnailDark: null };
  const view = {
    claude: { items: [{ ...base, id: "deck", title: "Deck", url: "https://claude.ai/code/artifact/deck" }], error: null },
    codex: { items: [{ ...base, id: "p1", title: "Merge", url: "https://merge.it-space.chatgpt.site" }], error: null },
    fetchedAt: 1,
  };
  assert.equal(findByUrl(view, "https://claude.ai/code/artifact/deck/?x=1")?.item.id, "deck");
  assert.equal(findByUrl(view, " https://MERGE.it-space.chatgpt.site/ ")?.source, "codex");
  assert.equal(findByUrl(view, "https://claude.ai/code/artifact/other"), null);
  assert.equal(urlKey("javascript:alert(1)"), null);
  assert.equal(urlKey("http://claude.ai/code/artifact/deck"), null);
});
