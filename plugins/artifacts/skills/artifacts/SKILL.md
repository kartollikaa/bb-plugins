---
name: artifacts
description: Use when the user asks about their published Claude Code artifacts or Codex Sites, or when you hand over, mention or link one of them in a reply.
---

# Artifacts and Codex Sites

`bb artifacts list` prints the user's published Claude Code artifacts and Codex Sites, newest
first. `bb artifacts list --json` prints `{claude, codex, fetchedAt}`, where each source is
`{items, error}` and each item has `id`, `title`, `url`, `updatedAt`, `description`, `detail`
(who can open it: Public, Private, Workspace…), `starred`, `thumbnail` and `thumbnailDark`.

When you hand over or point at one of them, put a card on its own line in the reply instead of
only a link:

```
::artifact{url="https://claude.ai/code/artifact/<slug>"}
```

- `url` is the item's `url` from the list: `https://claude.ai/code/artifact/<slug>` for an
  artifact, the site's live `https://….chatgpt.site` address for a Codex Site.
- The card shows the preview image, title, access and age, and opens the URL in bb's browser.
  A URL that is not in the user's list renders a plain link card saying so.
- Never put the directive inside inline code or a code block; it then stays literal text.

## Errors

A source's `error` says why its list is empty:

- "No Claude Code login in the keychain": the user hasn't signed in with `claude` on the bb server.
- "…has expired" or "Claude refused…": open Claude Code once so it refreshes the token.
- "Couldn't read the Claude Code login from the keychain": the keychain prompt was denied or timed
  out, or the bb server isn't a Mac.
- "ChatGPT refused the Codex login" or a missing `auth.json`: run `codex login`.

## Development

Before releasing this plugin, run `npm test`, `npm run typecheck` and `bb plugin build` in its
directory. The test command includes an isolated build with production dependencies; a working
path install with development dependencies does not verify a Git installation.
