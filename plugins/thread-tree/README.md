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

A PR icon with its number sits below the thread title and shows the pull request
for the thread's environment branch. Its color shows draft, open, merged or closed; a small indicator shows
pending or failed checks and conflicts. Hover for details; click to open GitHub.
It also appears on child threads and Recent Activity rows, including when age
labels are hidden. The built-in GitHub PR Status plugin supplies and refreshes
the status; GitHub Folder is optional.

With Thread Links installed, every PR linked in the session's prompts or agent
replies is listed below that thread, alongside its branch PR. Duplicate URLs
appear once; different repositories with the same PR number stay separate.
Badges form one horizontal row with scrolling when they overflow. Thread Links
supplies their status through the bb server's gh login. Unavailable statuses
keep a neutral clickable badge. Session PRs refresh as the thread changes and
periodically while visible; without Thread Links, the branch badge still works.
An orchestrator hides PRs owned by its subthreads, including nested or folded
subthreads, while keeping its own unique PRs. Matching uses the full PR URL.

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
