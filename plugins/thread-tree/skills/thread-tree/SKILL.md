---
name: thread-tree
description: List the provider subagents (Claude Code Agent calls, Codex subagents) a bb thread has run, with their state, using `bb thread-tree list`.
---

# Thread Tree

The Thread Tree plugin replaces the sidebar thread list. Child threads nest
under the thread that spawned them; provider subagents, which are not threads
and cannot be messaged, show as a counter with a status dot on the parent's row.
The counter's card fits the available screen space on mobile and desktop;
longer lists scroll inside it while the summary stays visible.

When the GitHub Folder plugin is installed, the list's top section is its
folder of pull requests that need the user. Use that plugin's
`bb github-folder list` to read it.

A PR icon after the age label shows the pull request for the thread's environment
branch. Its color shows draft, open, merged or closed; a small indicator shows
pending or failed checks and conflicts. Hover for details; click to open GitHub.
It also appears on child threads and Recent Activity rows, including when age
labels are hidden. The built-in GitHub PR Status plugin supplies and refreshes
the status; GitHub Folder is optional.

## Command

```sh
bb thread-tree list [thread-id] [--json]
```

Without a thread id it reads the thread the command runs in. Text output is one
line per subagent, newest first: state, `bg`/`fg` (background or foreground),
agent type, and label. `--json` returns `{ threadId, total, subagents }`; each
subagent has `id`, `label`, `agentType`, `background`, `state` (`running`,
`completed`, `failed`, `stopped`), `startedAt`, `endedAt`, `totalTokens`, and
`toolUses`. Only the newest subagents are listed; `total` counts all of them.

The CLI reports `state` as the event log recorded it. The sidebar additionally
shows a `running` subagent as stopped once its thread has no live work, because
a provider cannot report an end after its session is gone.

## Undoing an archive

Cmd+Z or Ctrl+Z unarchives the latest
archive batch: threads archived moments apart, as a
parent and its children are. Each press steps one batch further back, within
the last few minutes. The plugin remembers archives in its server process, so a
plugin reload or bb restart forgets them; an agent restores older ones with
`bb thread unarchive`, or the user does it from the Archived view. In a text field
the keystroke stays a text undo once the user has typed there since the archive.

## Settings

`bb plugin config thread-tree` lists them; `bb plugin config thread-tree set <key> <value>` changes one.
Booleans: `showGithub`, `showAutomations`, `showRecent`, `showProviderIcon`, `showSubagents`, `showAge`,
`foldOnDrag` (fold every block while a section or project is dragged), `reduceMotion` (no folder, reorder or hover animation).
Numbers (1–50): `recentLimit` (Recent Activity rows), `recentMoreLimit` (rows after Show more).
The order of GitHub, Automations and Recent Activity, the project order, and which groups are
folded are not settings: each browser client keeps them itself. The user changes them in the
sidebar by dragging a header or from its right-click menu.

## Making a subagent you can talk to

A provider subagent cannot be messaged. To get one that can, spawn a child
thread instead: `bb thread spawn --parent-self ...` from inside the parent, or
`--parent-thread <id>` from elsewhere. It appears nested under the parent in
the sidebar and accepts messages like any thread.

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
