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
- MIT. Release and marketplace status: [publication.md](publication.md).

## thread-tree — `plugins/thread-tree/`

- **What:** replaces the sidebar thread list with a tree of child threads nested under their parent.
  It also shows automations, recent activity, the archived toggle, and provider subagents as a
  counter on the parent's row. CLI: `bb thread-tree list`. Section and project order, folds and
  flags are per-client localStorage (`src/usePersistentSet.ts`); `src/useReorder.ts` drives drag
  reordering (live preview, sliding, the grabbed block pinned while the others fold).
- **Thread PR status:** an icon and PR number below the thread title show the built-in GitHub PR Status
  data for the environment's branch, including state, checks and conflicts. Hover for
  details; click to open GitHub. With Thread Links installed, session PR links are
  also listed and deduplicated by URL. Child threads and Recent Activity use the same row.
- **GitHub folder:** when the `github-folder` plugin is installed, the top section draws its folder
  in thread-tree's row style. The server proxies `githubFolder`, `githubFolderUpdate`,
  `githubFolderSnooze` and `githubFolderPrefetch` to that plugin's RPC, like Automations; without it the section is hidden.
- **Undo archive:** the server records `thread.archived` events in memory; Cmd/Ctrl+Z outside a
  text field calls RPC `undoArchive`, which unarchives the latest batch (`src/archiveUndo.ts`).
- **Agent skills:** `skills/thread-tree/` and `skills/delegate-to-threads/`. The second one is how
  agents spawn child threads with `bb thread spawn --parent-self`.
- **Tests:** `npm test` covers `test/*.test.ts` (tree, subagents, automations, settings, archive undo, no `:has()` in classes). Run
  `npm run typecheck` too. Components live in `src/`.
- The thread list slot is exclusive: with several list plugins installed, only one is shown.
- MIT. Release and marketplace status: [publication.md](publication.md).

## reveal-in-finder — `plugins/reveal-in-finder/`

- **What:** the `::file{path="…"}` message directive renders as a file card with an icon, name and
  size. Clicking the card opens bb's preview. "Open in ▾" offers Finder, the default app or bb
  preview. CLI: `bb reveal-in-finder show <absolute-path>`. The open actions need macOS.
- **Agent skill:** `skills/reveal-in-finder/`. It tells agents to put `::file{path="…"}` on its own
  line for deliverables, never inside code.
- **Tests:** `npm test` covers `test/reveal.test.ts` (path resolution, open args, card labels).
  There is no `typecheck` script. Run `npx tsc -p .` when touching types.
- MIT. Release and marketplace status: [publication.md](publication.md).

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
- MIT. Release and marketplace status: [publication.md](publication.md).

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
- MIT. Release and marketplace status: [publication.md](publication.md).

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
- MIT. Release and marketplace status: [publication.md](publication.md).

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
  lookup) and builds an isolated copy with production dependencies. `npm run test:production`
  runs that build alone. Run `npm run typecheck` too.
- MIT. Release and marketplace status: [publication.md](publication.md).

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
- MIT. Release and marketplace status: [publication.md](publication.md).

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
- MIT. Release and marketplace status: [publication.md](publication.md).

## thread-switcher — `plugins/thread-switcher/`

- **What:** holding the hotkey (setting `hotkey`, `Control+Tab` by default) opens a row of cards for
  the most recently opened threads (setting `threadCount`, 6 by default), each with a preview of the
  chat's latest messages, a two-line title, project, age and branch, a status dot and an amber outline when the thread needs input; such a card shows the pending
  question or approval instead, and a card ends with a subthread recap in thread-tree's fold-line
  style (`subthreadCounts` over `parentThreadId`), or a subagent recap from timeline delegation rows;
  running threads refetch their timeline each time the switcher opens. It never shows commands or
  steps, by Dmitrii's call: the switcher is for jumping, not reading.
  The switcher is for jumping fast, so it has no larger chat view.
  Threads needing input, then failed ones, follow the
  current thread (setting `attentionFirst`, on by default). The key moves on, Shift moves back, letting go of the modifier opens the
  selection; a tap returns to the previous thread. The settings page has a shortcut recorder.
  On touch screens a two-finger pinch-in (setting `pinchToOpen`, on by default) opens the same cards
  as a full-screen grid: tap to open, spread two fingers, ✕ or a tap outside to close. It fires only
  on a thread route or over the open thread list, at page scale 1 from the gesture's start, with no
  side panel, dialog, menu or photo lightbox open (`lib/gate.ts`, fed from bb's DOM in `readScreen`).
  The grid blocks page zoom and unmounts only after every finger lifts, so bb's sidebar swipe gets
  its touchend.
- **How:** an `experimental_appOverlay` with capture-phase `keydown`/`keyup` listeners on `window`.
  The visit order is in `localStorage` (`<pluginId>:recent`), updated from `useBbContext().threadId`;
  threads come from `experimental_useSidebarThreads`. Previews are conversation rows and the pending
  question, approval or form work row from `sdk.threads.timeline({ segmentLimit: "4" })`, prefetched for the candidate threads and cached per
  thread by `updatedAt`. `lib/status.ts` copies thread-tree's `threadDotState` and dot colors; change
  both together. The recorder saves through the `setHotkey` RPC. Hotkey parsing, ordering,
  preview extraction and the pinch tracker (`lib/pinch.ts`) are pure functions in `lib/`.
- **Agent skill:** `skills/thread-switcher/`.
- **Tests:** `npm test` covers `test/switcher.test.ts` (hotkey parsing and matching, release, visit
  order, ordering, urgency order, count, preview and pending-request extraction, subagent and subthread counts, status priority,
  ages), `test/pinch.test.ts` (pinch direction and gesture tracking) and `test/gate.test.ts` (where
  the pinch may open the grid). Run `npm run typecheck`. Opening, stepping, release, tap-back, Esc, the one-row layout, the
  subthread recap and the recorder were checked in the live app. On a phone-sized touch viewport:
  pinch open in a chat and over the thread list, tap to switch, spread and ✕ to close, sidebar and
  side-panel swipes afterwards, no grid on `/`, over the side panel, a modal or while pinching a
  zoomed page back out, keyboard hidden on open, grid scrolling. The photo lightbox itself was not
  opened; a stand-in modal was; the pending-request card was not, as no
  thread was waiting at the time.
- MIT. Release and marketplace status: [publication.md](publication.md).

## task-stop — `plugins/task-stop/`

- **What:** a ■ button on each row of bb's background tasks card ("Running background command/agent").
  bb core can only interrupt the whole turn; this stops one task. A command's processes are killed
  directly; a background agent gets a steer message asking the agent to call `TaskStop` on it.
- **How:** a content script (`lib/stop-buttons.ts`, selectors in `lib/card.ts`) adds the buttons and
  POSTs to the plugin's `/stop` route. The server folds the thread's `backgroundTask` events
  (`lib/tasks.ts`; `familyId` is Claude's task id, `providerThreadId` its session), finds the task's
  `<tmp>/claude-<uid>/<cwd>/<session>/tasks/<id>.output` and kills what `lsof` says writes it. No
  output file or no writer (remote host, other provider) falls back to the message.
- **Agent skill:** `skills/task-stop/`. It tells the agent to obey the stop message and not to restart
  a command the user stopped.
- **Tests:** `npm test` covers `test/*.test.ts` (event fold, task matching, request schema, route
  parsing). Run `npm run typecheck`.
- MIT. Not released yet; not in `marketplace.json`.

## kaiten — `plugins/kaiten/`

- **What:** a Kaiten nav panel with the sprint board (default: board `1330003`, "Sprint", on
  `dodopizza.kaiten.ru`) as columns of cards. A click on a card starts a thread in the project chosen
  in the page header ("Threads start in"); the thread's first message carries the card (title, link,
  type, owner, size, tags, description, checklists, latest comments). A card that already has a live
  thread shows a "Thread" chip and a click opens that thread instead of starting a second one. Filters:
  text, Mine, Done (hidden by default). CLI: `bb kaiten board [--json]`.
- **How:** the server reads the token from the plugin settings, then `~/.config/kaiten/.env.local`
  (`KAITEN_TOKEN`, `KAITEN_DOMAIN`), then the Kaiten MCP's `~/.config/kaiten/config.json` (`token`,
  `url`). It pages `GET /cards?board_id=…&condition=1` and refreshes on a background loop, invalidating
  the `board` RPC tag on change. Card → thread links and the chosen project live in `bb.storage.kv`
  (`threads`, `projectId`); links are checked against `threads.list` so an archived thread frees the card.
  Sub-columns (Coding, Code review) fold into their column and show as a chip on the card.
- **Agent skill:** `skills/kaiten/`.
- **Tests:** `npm test` covers `test/kaiten.test.ts` (credentials order, board building, filters, the
  card prompt). Run `npm run typecheck`.
- MIT. Not released yet; not in `marketplace.json`.

## orchestration — `plugins/orchestration/`

- **What:** a full-page Orchestration view that an orchestrator's thread redirects to (chat in a
  collapsible `ThreadChat` rail, Full chat goes back), plus a fixed side-panel tab and a context-card
  row, all only on a thread that an orchestrate ledger's first line names. The `orchestrationView`
  setting (on by default) is written by the title-bar switch and a matching thread-header action. One status sentence, a card per thing that needs the
  owner, the team as one row per subtask, and a goal/history fold. Answer and Release only fill the
  orchestrator's composer.
- **How:** the server scans `~/.claude/projects/*/orchestrate/*.md` first lines, runs orchestrate's
  `orchestration_ledger.py export` (setting `exportScript`, else the plugin cache, newest first) and
  adds per-agent model, effort, context and last output from `threads.*`. The app merges that with
  `experimental_useSidebarThreads()`; `src/view.ts` is the pure view model (needs you, stuck, done).
- **Agent skill:** `skills/orchestration/`.
- **Tests:** `npm test` covers `test/*.test.ts` (ledger export summary, ledger lookup, view model,
  both stuck thresholds, and the view's route, chat preference and rail geometry). Run `npm run typecheck`.
- MIT. Not released yet; not in `marketplace.json`.

## Retired repos

Before the monorepo, each plugin had its own repo, `kartollikaa/bb-plugin-<id>`. They were deleted on
2026-11-02; only Dmitrii had installed from them. Their history lives on here under `plugins/<id>/`.
