# Thread Tree

A bb sidebar thread list where child threads nest under their parent and each
thread's provider subagents show as a counter with a status dot.

See [PLUGIN_OVERVIEW.md](PLUGIN_OVERVIEW.md) for what it does and
[skills/thread-tree/SKILL.md](skills/thread-tree/SKILL.md) for the CLI.

Each row draws bb's thread status glyph (spinner, needs input, failed, unread
result, draft, or another plugin's row status) and a faint dot when idle; the
row's link carries bb's state label, and holding the jump modifier shows bb's
jump keys on the rows. `src/statusGlyph.ts` folds the draft and row status into
the indicator the way bb's own list does.

The subagent counter opens a list that fits the available screen space, including
on mobile. Longer lists scroll inside the card while the summary stays visible.

Every thread row is one line and keeps one height whatever its state; rows are
taller on a phone-sized viewport. Left to right: status glyph, title, Retry on a
failed turn, PR icon, shared-branch warning, subagent counter, provider icon, age.
Hovering the row shows its title, branch, provider and when it last updated.

Hovering a row, or focusing it with the keyboard, fades Archive and ⋯ in over
its right end at once; nothing under them moves. They cover only the provider
icon and age, so Retry, the PR icon, the ⚠ and the subagent counter stay
visible and clickable. ⋯ is outermost. Archive is bb's own action, with its
confirmation and Undo toast, and Cmd/Ctrl+Z still restores it. Hovering the
spinner of a running thread turns it into Stop, which ends the turn and its
background work; a thread stuck stopping can be stopped again. A parent row's
glyph folds its subtree, so a running parent offers Stop in ⋯ and the
right-click menu, as every working row does. On touch screens the glyph stays a
glyph, so a tap never stops a thread; a long press opens the row's menu.
The PR icon appears only when one of the thread's pull requests needs action:
checks failing (red), conflicts (orange), changes requested (amber) or ready to
merge (green). Hover it for the number, title and reason; click it to open
GitHub. A quiet, merged or closed PR shows nothing, and a failed thread shows
Retry instead. The built-in GitHub PR Status plugin supplies the branch PR's
checks and conflicts; with Thread Links installed, PRs linked in the session
count too. Changes requested and ready to merge come from the GitHub Folder
plugin, matched by PR URL; without it those two reasons never show. An
orchestrator leaves PRs owned by its subthreads to their rows. The list
re-reads the PRs linked in sessions for all threads in one batch on a timer,
and one thread's links when its turn settles; nothing is re-read while the
sidebar is hidden. The branch PR's checks and conflicts update on GitHub PR
Status's own schedule.

A ⚠ marks a thread whose branch or worktree another unarchived thread also
uses; its tooltip names the other thread. Threads in a project's own checkout,
and an orchestrator with its subthreads, never warn.

The provider icon sits in a fixed slot before the age, in the provider's brand
tint (Claude orange, Codex blue-violet), or in the text colour with the
`providerIconStyle` setting set to `monochrome`. This setting replaces
`showProviderIcon`: the icon can no longer be turned off, so a user who had
turned it off sees it again.

## Redesign in progress

The next sidebar redesign is specified in [docs/sidebar-v2.md](docs/sidebar-v2.md),
with an interactive prototype in [docs/sidebar-v2-prototype.html](docs/sidebar-v2-prototype.html).
It is built in slices; each slice updates this README when it ships.

## Develop

```sh
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```

The thread list slot is exclusive. With several list plugins installed, pick
this one under Settings → Appearance → Sidebar, or run
`bb settings ui set sidebar.threadListProvider thread-tree/thread-tree`.

## Layout

- `server.ts`: RPC `subagents` and `undoArchive`, the Automations and GitHub Folder proxies, and the `bb thread-tree` command.
- `src/githubFolder.ts`: the slice of the GitHub Folder plugin's view that the GitHub section draws.
- `src/subagents.ts`: folds a thread's event log into its subagents.
- `src/tree.ts`: pure tree, grouping and subagent state logic.
- `src/archiveUndo.ts`: which recent archives one Cmd/Ctrl+Z brings back.
- `src/ThreadTreeList.tsx`, `src/SubagentBadge.tsx`, `src/GithubSection.tsx`: the sidebar UI.
- `test/`: `node --test` suites for the pure modules.

## Sorting threads in a folder

Open the funnel icon beside Archived and the Group layers icon in the Threads
heading to choose the global thread order. Each folder follows it unless you
open its Thread settings and choose an override. Use global setting clears that override. The global choice
and folder overrides persist in this browser, including after a reload:

- Last activity (default): most recently active first.
- Creation date: newest first; message activity keeps rows in place.
- Status: needs input, errors, working, waiting (a queued message or a goal between turns), then done, using the most urgent state
  in each thread's subtree. Within a status, newest threads come first.

This applies to project folders, status groups, and All threads in both active
and archived views. Child threads stay beneath their parent in spawn order.
Pinned keeps its manual order; Recent Activity always follows last activity.
Folder thread sorting is separate from project folder order in the grouping menu.

Sorting and grouping menus stay open after a selection; click outside or press
Escape to close them. Changes apply immediately.

## Empty project folders

Once a project has had a visible thread, its folder stays in the active Project
view even after its last thread is archived or deleted. The folder shows zero
threads and keeps its + button for starting a new chat. When expanded, an empty
folder shows a clickable “Start a new thread” row that opens the composer in
that project. Collapsing the folder hides this row. Used projects are stored
on the bb server and seeded from existing active and archived threads, so the
folders survive reloads and appear on other clients. A browser cache keeps them
visible during a failed history read. Deleting a project removes its folder;
new projects without threads stay hidden. The Archived view continues to show
only folders with archived threads. Threads deleted before this feature was
installed cannot be recovered from history.
