# Plugins

Check the live state with `bb plugin list` and `bb plugin source <id>`. This page records what the
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
- **GitHub folder:** the top section lists open PRs that need Dmitrii, like Arc's GitHub live folder.
  The server runs one GraphQL search (review-requested, user-review-requested, author, assignee,
  mentions) per gh login, default first and then each `~/.config/gh-*` profile, deduplicated by
  login, cached for a minute. Filters, org choices and snoozes are per client in localStorage;
  the pure logic is `src/github.ts`.
- **Agent skills:** `skills/thread-tree/` and `skills/delegate-to-threads/`. The second one is how
  agents spawn child threads with `bb thread spawn --parent-self`.
- **Tests:** `npm test` covers `test/*.test.ts` (tree, subagents, automations, github). Run
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
- No license file and no `PLUGIN_OVERVIEW.md` yet. Both are needed before a bb-community
  submission. Tag: `reveal-in-finder/v0.1.0`.
- **Not verified yet:** how the card looks in the real chat. Headless screenshots came out black.

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
- Not in `marketplace.json` yet: it needs a first `battery/v0.1.0` tag and a store icon.

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
- Not in `marketplace.json` yet: it needs a first `thread-links/v0.1.0` tag.

## Retired repos

Before the monorepo, each plugin had its own repo, `kartollikaa/bb-plugin-<id>`. They were deleted on
2026-11-02; only Dmitrii had installed from them. Their history lives on here under `plugins/<id>/`.
