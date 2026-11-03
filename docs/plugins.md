# Plugins

Check the live state with `bb plugin list` and `bb plugin source <id>`. Release and store state: [publication.md](publication.md). This page records what the
plugins are for and how each one is wired. All of them are installed on Dmitrii's Mac from the local
checkout, `path:~/Projects/bb --plugin <id>`, so a reload picks up local edits.

## inline-terminal — `plugins/inline-terminal/`

- **What:** adds a Run button to shell code blocks in agent replies. It opens an interactive terminal
  under the block and sends the exit code and output back to the agent as hidden context.
- **Agent skill:** `skills/inline-terminal/`. It explains how a shell block becomes runnable and how
  results come back as `[inline-terminal]` messages.
- **Tests:** `npm test` covers `lib/command.test.ts`; `test/wrapper_pty.py` runs the launcher in a
  real PTY. Run `npm run typecheck` too.
- MIT. Tags: `inline-terminal/v0.1.0` through `v0.1.2`.

## thread-tree — `plugins/thread-tree/`

- **What:** replaces the sidebar thread list with a tree of child threads nested under their parent.
  It also shows automations, recent activity, the archived toggle, and provider subagents as a
  counter on the parent's row. CLI: `bb thread-tree list`.
- **GitHub folder:** when the `github-folder` plugin is installed, the top section draws its folder
  in thread-tree's row style. The server proxies `githubFolder`, `githubFolderUpdate`,
  `githubFolderSnooze` and `githubFolderPrefetch` to that plugin's RPC, like Automations; without it the section is hidden.
- **Agent skills:** `skills/thread-tree/` and `skills/delegate-to-threads/`. The second one is how
  agents spawn child threads with `bb thread spawn --parent-self`.
- **Tests:** `npm test` covers `test/*.test.ts` (tree, subagents, automations). Run
  `npm run typecheck` too. Components live in `src/`.
- The thread list slot is exclusive: with several list plugins installed, only one is shown.
- MIT. Tag: `thread-tree/v0.1.0`.

## reveal-in-finder — `plugins/reveal-in-finder/`

- **What:** the `::file{path="…"}` message directive renders as a file card with an icon, name and
  size. Clicking the card opens bb's preview. "Open in ▾" offers Finder, the default app or bb
  preview. CLI: `bb reveal-in-finder show <absolute-path>`. The open actions need macOS.
- **Agent skill:** `skills/reveal-in-finder/`. It tells agents to put `::file{path="…"}` on its own
  line for deliverables, never inside code.
- **Tests:** `npm test` covers `test/reveal.test.ts` (path resolution, open args, card labels).
  There is no `typecheck` script. Run `npx tsc -p .` when touching types.
- MIT. Tags: `reveal-in-finder/v0.1.0`, `v0.1.1`.

## battery — `plugins/battery/`

- **What:** a button at the right end of the sidebar footer row with a battery icon and the server
  machine's charge; the fill is red ≤20%, yellow ≤50%, green above. A click opens a popup: the
  laptop's state, plus the viewing device's battery (`navigator.getBattery`) when bb is opened
  remotely. No time estimates in the UI; the CLI still prints them.
  CLI: `bb battery status [--json]`. Reads `pmset -g batt`, so macOS only.
- **How:** a content script (`lib/footer-percent.ts`) adds its own `<li>` to
  `[data-sidebar="footer"] > ul` and polls the plugin's `GET /status` HTTP route. It is deliberately
  not an `experimental_sidebarFooter` item: those are icon-only and live in the footer's item list.
  The selector depends on bb's footer DOM; if the button disappears after a bb upgrade, check it first.
- **Agent skill:** `skills/battery/`.
- **Tests:** `npm test` covers `test/battery.test.ts` (pmset parsing, labels). Run `npm run typecheck`.
- MIT. Tag: `battery/v0.1.0`.

## thread-links — `plugins/thread-links/`

- **What:** a "Links" section in the thread context card listing every URL the thread's prompts and
  agent replies mention (tool output is skipped), one row per page: PRs first, then issues, Kaiten,
  Buildin, Figma, commits, repos and other sites, latest mention first. A GitHub PR row: a state icon in colour (draft, open, conflicts, merged, closed),
  a review icon (approved / changes requested), a CI dot that pulses while jobs run and opens a popup
  of jobs on click, and `+added −removed · N files` on the line under it. CLI: `bb thread-links list <thread-id> [--json]`.
- **How:** the server reads `client/turn/requested` and `item/completed` events with
  `bb.sdk.threads.events.list`, incrementally per thread, and invalidates the `links:<thread>` RPC
  tag on `experimental_thread.events`. PR and issue status comes from `gh pr view` / `gh issue view`
  on the server: the default login first, then each `~/.config/gh-*` profile, remembering which one
  worked per owner. Open PRs refresh while the card is mounted.
- **Card only:** the section shows where bb draws the thread context card (the `threadContextCard`
  experiment, a thread opened as a page, not on phones). There is no banner segment.
- **Agent skill:** `skills/thread-links/`.
- **Tests:** `npm test` covers `test/links.test.ts` (URL extraction, classification, check rollup,
  PR chips). Run `npm run typecheck`.
- MIT. Not in `marketplace.json` yet: it needs a first `thread-links/v0.1.0` tag.

## github-folder — `plugins/github-folder/`

- **What:** a folder of the open GitHub PRs that need Dmitrii, like Arc's GitHub live folder: review
  requests, his PRs with changes requested, failing checks, conflicts or ready to merge, optionally
  assigned and mentions. A header button customizes sources, drafts and orgs; rows snooze until
  the PR changes. A row click opens the plugin's `pr` page: a context card for the PR above
  bb's `NewThreadComposer`, in the project whose remote is the PR's repo. The PR context goes to
  the agent as an `agent-only` input. ⌘-click or the hover arrow opens GitHub. CLI: `bb github-folder list [--json]`.
- **How:** the server runs one GraphQL search per gh login (default, then each `~/.config/gh-*`
  profile, deduplicated by login) on a background loop, keeps settings and snoozes in `bb.storage.kv`,
  and invalidates the `folder` RPC tag on change. The frontend is an `experimental_appOverlay` that
  portals the folder above bb's own list (`[data-sidebar="content"] > [data-bb-plugin="thread-list"]`)
  with that list's classes. thread-tree draws its own copy through the RPC instead.
- **Fragile:** the selector above depends on bb's sidebar DOM; check it first if the folder
  disappears from bb's list after an upgrade.
- **Agent skill:** `skills/github-folder/`.
- **Tests:** `npm test` covers `test/github.test.ts` (query, parsing, filters, settings). Run
  `npm run typecheck`.
- MIT. Not in `marketplace.json` yet: it needs a first `github-folder/v0.1.0` tag.

## artifacts — `plugins/artifacts/`

- **What:** an Artifacts nav panel with Dmitrii's published Claude Code artifacts and Codex Sites
  as a grid of preview cards; a click opens the item through `useBbNavigate().openUrl`. The
  `::artifact{url="…"}` message directive draws the same card in chat. CLI: `bb artifacts list [--json]`.
- **How:** the server reads the Claude Code OAuth token from the keychain item
  `Claude Code-credentials` and calls `GET api.anthropic.com/api/frame/frames` with Claude Code's
  `X-Frame-*` headers. Codex: `~/.codex/auth.json` → MCP over HTTP at
  `chatgpt.com/backend-api/wham/apps`, tool `sites_list_sites`. The list is cached in memory; the
  `list` RPC tag is invalidated after each fetch. The page and the directive share
  `components/ArtifactCard.tsx` and the same `list` query.
- **Fragile:** both endpoints are private. If Claude answers 404, compare the `X-Frame-*` headers
  with what the current Claude Code binary sends. Shared-with-me artifacts (`/frames/external`)
  need a browser session, so they are not listed.
- **Agent skill:** `skills/artifacts/`.
- **Tests:** `npm test` covers `test/sources.test.ts` (credentials, parsing, paging, errors, URL
  lookup). Run `npm run typecheck`.
- MIT. Released as `artifacts/v0.1.0` and listed in `marketplace.json`.

## mouse-pet — `plugins/mouse-pet/`

- **What:** a small mouse that lives along the bottom edge of the bb window. It walks, runs, sits,
  grooms and sleeps (with a floating "z"), turns at both window edges, and on a click hops, squeaks
  "Pi!" and bolts the other way. Only the mouse takes clicks; the strip it moves in does not.
- **How:** a content script (`lib/mouse-pet.ts`) appends a fixed `[data-mouse-pet]` layer to `body`
  and moves the sprite with a `requestAnimationFrame` loop. Legs, tail, blink and poses are CSS
  keyframes keyed on `data-mode`. The movement rules (modes, weights, durations, edge bounce) are pure
  functions in `lib/pet.ts`. With `prefers-reduced-motion` it sits still and animations are off.
- **No commands or settings:** the server entry is empty because bb requires one. Turn the pet off by
  disabling the plugin.
- **Agent skill:** `skills/mouse-pet/`.
- **Tests:** `npm test` covers `test/pet.test.ts` (movement, bounce, mode choice, startle). Run
  `npm run typecheck`. The sprite and animations are checked by eye in the app.
- MIT. Not released and not in `marketplace.json` yet: it needs a first `mouse-pet/v0.1.0` tag.

## power-pill — `plugins/power-pill/`

- **What:** a capsule button in the sidebar footer, left of battery's, amber with the time left while
  on. Its popup has an on/off switch, a duration (∞, 1/2/4/8 h) and "Also with the lid closed". The
  session ends on its timer or at low battery (`BATTERY_FLOOR`), and survives reloads and bb restarts (kv `session`).
  CLI: `bb power-pill status [--json] | on [--for 2h] [--lid] | off`.
- **How:** the server runs `caffeinate -i -m -s -w <pid>`. Closed-lid mode runs
  `sudo -n pmset -a disablesleep 1` (macOS ignores assertions on lid close) and resets it at the end;
  a detached `sh` watchdog resets it if the server process dies. It needs a sudoers rule for exactly
  those commands; readiness is checked with `sudo -k -n -l`, which ignores cached credentials. The
  footer button is a content script (`lib/footer.ts`) over `GET /status`, `POST /start`, `POST /stop`;
  it inserts itself before `[data-battery-footer]` so the two don't fight over the last slot.
- **Agent skill:** `skills/power-pill/`.
- **Tests:** `npm test` covers `test/pill.test.ts` (pmset parsing, request validation, stop rules,
  durations, labels, setup command). Run `npm run typecheck`. The popup was checked in the live app.
- MIT. Not released and not in `marketplace.json` yet: it needs a first `power-pill/v0.1.0` tag.

## thread-switcher — `plugins/thread-switcher/`

- **What:** holding the hotkey (setting `hotkey`, `Control+Tab` by default) opens a row of cards for
  the most recently opened threads (setting `threadCount`, 6 by default), each with a preview of the
  chat's latest messages, a two-line title, project, age and branch, a status dot and an amber outline when the thread needs input; such a card shows the pending
  question or approval instead. A panel under the cards renders the selected thread's last ten
  messages with the SDK `Markdown` component. Threads needing input, then failed ones, follow the
  current thread (setting `attentionFirst`, on by default). The key moves on, Shift moves back, letting go of the modifier opens the
  selection; a tap returns to the previous thread. The settings page has a shortcut recorder.
- **How:** an `experimental_appOverlay` with capture-phase `keydown`/`keyup` listeners on `window`.
  The visit order is in `localStorage` (`<pluginId>:recent`), updated from `useBbContext().threadId`;
  threads come from `experimental_useSidebarThreads`. Previews are conversation rows and the pending
  question, approval or form work row from `sdk.threads.timeline({ segmentLimit: "4" })`, prefetched for the candidate threads and cached per
  thread by `updatedAt`. `lib/status.ts` copies thread-tree's `threadDotState` and dot colors; change
  both together. The recorder saves through the `setHotkey` RPC. Hotkey parsing, ordering and
  preview extraction are pure functions in `lib/`.
- **Agent skill:** `skills/thread-switcher/`.
- **Tests:** `npm test` covers `test/switcher.test.ts` (hotkey parsing and matching, release, visit
  order, ordering, urgency order, count, preview and pending-request extraction, status priority,
  ages). Run `npm run typecheck`. Opening, stepping, release, tap-back, Esc, the one-row layout, the
  detail panel and the recorder were checked in the live app; the pending-request card was not, as no
  thread was waiting at the time.
- MIT. Not released and not in `marketplace.json` yet: it needs a first `thread-switcher/v0.1.0` tag.

## Retired repos

Before the monorepo, each plugin had its own repo, `kartollikaa/bb-plugin-<id>`. They were deleted on
2026-11-02; only Dmitrii had installed from them. Their history lives on here under `plugins/<id>/`.
