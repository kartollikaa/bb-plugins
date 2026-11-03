# Artifacts

A bb page with your published Claude Code artifacts and Codex Sites, as a grid of previews. A click
opens the item in bb's browser, so you don't have to go to the Claude app or ChatGPT for it.
Agents can also show an artifact or site as the same preview card in chat.

## Use

- **Artifacts** in the navigation rail: Claude Code artifacts and Codex Sites, newest first, with
  a filter and a refresh button.
- In chat, an agent writes `::artifact{url="…"}` on its own line and the reply shows a card.
- `bb artifacts list [--json]` prints both lists in a terminal.

## How it works

The bb server reads the Claude Code login from the macOS keychain (`Claude Code-credentials`) and
the Codex login from `~/.codex/auth.json`. It asks `api.anthropic.com` for your artifacts and
ChatGPT's Sites service for your sites. Tokens stay on the bb server and go nowhere else. The list
is cached for a few minutes.

## Requirements

- A Mac running the bb server, signed in to Claude Code (`claude`) and/or Codex (`codex login`).
- Only items you published are listed; artifacts shared with you are not.

## Develop

```sh
npm install
npm test && npm run typecheck && npm run build
bb plugin install path:../.. --plugin artifacts
```

`npm test` also builds an isolated copy after installing only production dependencies, matching
Git installs. It needs npm registry access and the bb CLI. Run `npm run test:production` to check
that build on its own. Shared RPC contracts must stay usable by the frontend without importing
the server SDK at runtime.
