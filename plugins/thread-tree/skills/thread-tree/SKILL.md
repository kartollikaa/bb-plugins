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

Needs you sits above the sections and hides when nothing waits. In order:
threads asking a question (the question and how long they have waited, longest
first), failed turns, failed queued messages, and finished results not read
yet; then pull requests of the user's threads with failing checks, conflicts or
changes requested (ready to merge stays a row icon); then enabled automations
whose last run failed. Each item is two lines, title then reason; a subthread's
reason names its orchestration. Clicking an item opens its thread; a PR with no
thread opens GitHub Folder's PR page, an automation with no run the Automations
page. A failed turn offers Retry, a failed queued message Resend. Hovering an
item shows Snooze, which hides it until it changes and offers Undo, and Mark
read on a result; on a phone or touch screen both stay in the row. ⇧⌘I opens the next item, stepping on from the last one it
opened, always past the open thread's items, and says "Nothing else needs you" when only that
thread is left; it works anywhere in bb while the
sidebar thread list is loaded, and Settings → Keyboard rebinds it. On Windows and Linux it is Ctrl+Shift+I, which browsers
also use for DevTools. Each browser client keeps its own snoozes.

The line at the top counts threads that need input, failed, are running, and
finished but are not read yet. Each count is a toggle: it swaps the sections and
the tree for a flat list of those threads, children included, most recently
active first. Running rows add a second line with the project and the
orchestration they run under. Click the count again, Clear, or press Escape to
go back. `/` (outside a text field) or the search icon opens a search box that
matches the title, branch, PR number (`#123`) and project of the threads the
tree lists, archived ones when Archived is on. Escape clears it.

Every thread row keeps one height whatever its state; rows are taller on a
phone-sized viewport. A row is one line, except under the Running filter. Left to right: status glyph, title, Retry on a
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

An orchestrator is any thread with unarchived subthreads. The Orchestrations
section under the Threads heading has a shortcut for each top-level one that
still has work going: something in its tree runs, waits, needs input, failed or
finished unread. The shortcut's glyph is the most urgent of these, and its
second line gives the projects it spans and its progress, such as
`bb-plugins · 2/4 done · 1 needs you`. Clicking it opens the orchestrator,
unfolds its project folder and its tree, and briefly lights the tree up.
Finished orchestrations drop out by themselves; the section hides when empty
and in the archived view.

A folded parent's glyph shows its subtree's state when that is more urgent than
its own, labelled "Subthread needs input" and so on. The fold line counts the
subtree by state, with finished-unread threads as "to review"; from five
subthreads a small bar shows the same split. When the parent and every
subthread are done and read, the fold line says "all done" and offers Archive.
It asks once, then archives the tree leaves first. A thread whose worktree has
uncommitted or untracked changes, or whose git status can't be read, is skipped
along with the threads above it, and the toast says how many were skipped.
Hidden subthreads count too, since archiving a parent takes them along. One
Cmd/Ctrl+Z restores everything that Archive took.

The provider icon sits in a fixed slot before the age, in the provider's brand
tint (Claude orange, Codex blue-violet), or in the text colour with the
`providerIconStyle` setting set to `monochrome`. This setting replaces
`showProviderIcon`: the icon can no longer be turned off, so a user who had
turned it off sees it again.

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
Select: `providerIconStyle` (`tint` or `monochrome`); `needsYouPullRequests` (`linked`, the default:
PRs of the user's threads with failing checks, conflicts or changes requested; `all`: every GitHub
Folder item; `none`).
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
