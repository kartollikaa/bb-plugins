# Thread Tree

A bb sidebar thread list where child threads nest under their parent and each
thread's provider subagents show as a counter with a status dot.

See [PLUGIN_OVERVIEW.md](PLUGIN_OVERVIEW.md) for what it does and
[skills/thread-tree/SKILL.md](skills/thread-tree/SKILL.md) for the CLI.

The subagent counter opens a list that fits the available screen space, including
on mobile. Longer lists scroll inside the card while the summary stays visible.

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
- Status: needs input, errors, working, then done, using the most urgent state
  in each thread's subtree. Within a status, newest threads come first.

This applies to project folders, status groups, and All threads in both active
and archived views. Child threads stay beneath their parent in spawn order.
Pinned keeps its manual order; Recent Activity always follows last activity.
Folder thread sorting is separate from project folder order in the grouping menu.

Sorting and grouping menus stay open after a selection; click outside or press
Escape to close them. Changes apply immediately.
