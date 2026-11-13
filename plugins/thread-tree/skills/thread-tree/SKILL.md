---
name: thread-tree
description: List the provider subagents (Claude Code Agent calls, Codex subagents) a bb thread has run, with their state, using `bb thread-tree list`.
---

# Thread Tree

The Thread Tree plugin replaces the sidebar thread list. Child threads nest
under the thread that spawned them; provider subagents, which are not threads
and cannot be messaged, show as a counter with a status dot on the parent's row.
Each row's status is bb's own thread status glyph, including drafts and
statuses other plugins set on the row; an idle row shows a faint dot. The
row's link reads the state after the title for screen readers.
The counter's card fits the available screen space on mobile and desktop;
longer lists scroll inside it while the summary stays visible.

When the GitHub Folder plugin is installed, the list's top section is its
folder of pull requests that need the user. Use that plugin's
`bb github-folder list` to read it.

Every thread row is one line, 32px tall, whatever its state. Left to right: status
glyph, title, Retry on a failed turn, PR icon, shared-branch warning, subagent
counter, provider icon, age. Hovering the row shows its title, branch, provider
and when it last updated.

The PR icon appears only when one of the thread's pull requests needs action:
checks failing (red), conflicts (orange), changes requested (amber) or ready to
merge (green). Hover it for the number, title and reason; click it to open
GitHub. A quiet, merged or closed PR shows nothing, and a failed thread shows
Retry instead. The built-in GitHub PR Status plugin supplies the branch PR's
checks and conflicts; with Thread Links installed, PRs linked in the session
count too. Changes requested and ready to merge come from the GitHub Folder
plugin, matched by PR URL; without it those two reasons never show. An
orchestrator leaves PRs owned by its subthreads to their rows. The whole list
refreshes PR status in one batch, and pauses while the sidebar is hidden.

A ⚠ marks a thread whose branch or worktree another unarchived thread also
uses; its tooltip names the other thread. Threads in a project's own checkout
never warn.

The provider icon sits in a fixed slot before the age, in the provider's brand
tint (Claude orange, Codex green), or in the text colour with the
`providerIconStyle` setting set to `monochrome`.

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
Booleans: `showGithub`, `showAutomations`, `showRecent`, `showSubagents`, `showAge`,
`foldOnDrag` (fold every block while a section or project is dragged), `reduceMotion` (no folder, reorder, hover or status-spinner animation).
Select: `providerIconStyle` (`tint` or `monochrome`).
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
