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

When the GitHub Folder plugin is installed, the Pull requests section lists its
folder of pull requests that need the user. Use that plugin's
`bb github-folder list` to read it. The Pull requests and Automations sections
start folded; their header carries a right-aligned summary instead of a bare
count. Pull requests' leads
with the problems ("1 failing · 1 conflicts · 1 changes"), then the total;
Automations' gives failed and running automations and the soonest next run
("1 failed · next in 12m"), or the active count when nothing is scheduled. An
expanded PR row draws its most urgent reason as a tinted icon (the same look
as a thread row's PR icon), then the title and repo; the number and reasons are
in its tooltip. Hover shows "Open its thread" when one of the user's threads
links the PR (⌘/Ctrl-click opens that thread in a split), Open on GitHub, and
Snooze. A middle-click on these buttons does nothing, so it never opens GitHub.
An unclaimed PR whose repo is the remote of a bb project also offers Agent
review (a robot icon): it starts a thread in that project (the most recently
updated one when several share the remote) that reviews the PR with `gh`,
without checking out its branch or posting to GitHub, and opens it; the row then
offers Open its thread. A PR GitHub calls ready to merge, when it is the open
current-branch PR of a thread's environment, offers Merge instead: a toast asks
to confirm, then bb's GitHub PR Status merges it with a merge commit. The
server refuses when that environment's PR is no longer this one.
Paused automations stay behind "N paused".

Needs you sits above the sections in an amber card and hides when nothing
waits. Its header shows the count and the next-item key; the card lists the first
five items and "N more" opens the rest. In order:
threads asking a question (the question and how long they have waited, longest
first), failed turns, failed queued messages, threads stuck in a turn, and
finished results not read yet; then pull requests of the user's threads with failing checks, conflicts or
changes requested (ready to merge stays a row icon); then enabled automations
whose last run failed. Each item is two lines, title then reason; a subthread's
reason names its orchestration. Clicking an item opens its thread; a PR with no
thread opens GitHub Folder's PR page, an automation with no run the Automations
page. A result on a worktree of its own (no thread outside its subtree
uses it) shows its diff instead of "review the result": "Finished · +825 −36 ·
4 files", the branch's commits since its merge base plus uncommitted work, read
from bb's Git plugin. A plain checkout or a shared worktree holds other threads'
work, so it shows no diff. PR items carry the same Merge or Review button as
the Pull requests section; with the default PR setting neither applies, since
those PRs are linked and need fixes, not a merge. A failed turn offers Retry, a failed queued message Resend. A failed
turn's reason adds "rate limit" when the turn hit one, or "failed N times in a row" once failures repeat without a completed turn between. A thread is stuck
when its turn has gone a long time without progress (one threshold for every thread, orchestrator or subthread): no step, output or report in its event log. A command or tool call still running counts as work, so an agent waiting on a long test run or `bb thread wait` is not stuck; the Running list shows that step and its timer.
A thread waiting on the user is a question instead, and a turn that ended is
never stuck. Stuck items go longest silence first, read "Running, no progress
for 42m" and offer Stop. Hovering an
item shows Snooze, which hides it until it changes and offers Undo, and Mark
read on a result; on a phone or touch screen both stay in the row. ⇧⌘I (Ctrl+Shift+I on Windows and Linux) opens the next item, stepping on from the last one it
opened, always past the open thread's items, and says "Nothing else needs you" when only that
thread is left; it works anywhere in bb while the
sidebar thread list is loaded, and Settings → Keyboard rebinds it. Browsers also use Ctrl+Shift+I for DevTools. The header
hint shows the default for the platform, not a rebinding. Each browser client keeps its own snoozes.

Under the search field, a line counts threads that need input, failed, are running, and
finished but are not read yet. Each count is a toggle: it swaps the sections and
the tree for a flat list of those threads, children included, most recently
active first. Running rows add a second line: the turn's current step
("Running npm test", "Thinking", or "Rate limited" while a rate limit holds
it), the context fill once it runs high, the project and the orchestration
they run under. The age gives way to a live timer of the current turn. Click the count again, Clear, or press Escape to
go back. The search field above the counts, or `/` outside a text field, opens
search, which matches the title, branch, PR number (`#123`) and project of the
threads the tree lists, archived ones when Archived is on. Escape clears it, and
picking a count closes it.

Every thread row keeps one height whatever its state; rows are taller on a
phone-sized viewport. A row is one line, except under the Running filter. Left to right: status glyph, title, Retry on a
failed turn, PR icon, shared-branch warning, subagent counter, provider icon, age.
Hovering the row shows its title, branch, provider and its last activity; a
working or failed row adds how long its turn has run and its step, a rate limit
holding it, and how full its context is. The server reads these signals from
each working or failed thread's event log and refreshes a thread's when its
events move.

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

An orchestrator is a top-level thread (no visible parent) with at least one
unarchived subthread at any depth; nothing else counts, not a title or a name.
The Orchestrations section under the Threads heading, after Pinned and before
the project folders, has a shortcut for every orchestrator, idle and read ones
included, until the orchestrator or its last subthread is archived. Shortcuts
go most urgent first (needs input, failed, running, waiting), then finished
ones, read or not, which draw muted once read; ties go by the tree's latest
activity in bb's sense (`latestAttentionAt`). Opening or reading a thread
never moves its shortcut. The shortcut's glyph is the most urgent state in the tree, and
its second line gives the projects it spans and its progress, such as
`bb-plugins · 2/4 done · 1 needs you`. Clicking it opens the orchestrator like
any row, leaving the tree below as it is.
Archiving the subthreads closes an orchestration; the section hides when empty
and in the archived view.

A folded parent's glyph shows its subtree's state when that is more urgent than
its own. Its label names both, as in "Last turn failed; subthread needs input". The fold line counts the
subtree by state, with finished-unread threads as "to review"; a bigger subtree
also gets a small bar with the same split. When the parent and every subthread
are done and read, the fold line says "all done" and offers Archive. Archive
runs bb's own Archive action, so bb's confirmation setting and Undo apply. A
thread whose worktree has uncommitted or untracked changes, or whose git status
can't be read, is skipped along with the threads above it; hidden subthreads
and threads that archive along with a parent are checked too. With nothing to
skip, Archive goes straight to bb's action on the parent. Otherwise the fold
line first asks "Archive N · skip M" with the real counts, then bb's action
runs on each clean subtree in turn, and a toast says what was skipped.
Each subtree's worktrees are checked again right before its turn, and one that
got changes meanwhile is skipped too, as is one whose worktree can't be checked
again; the toast tells the two apart. While the run waits, a "Waiting for bb's
confirmation…" toast shows. Cancelling bb's confirmation stops the rest, as do
the toast's Stop when no dialog covers it and closing the sidebar; a run that
ends early says why. One Cmd/Ctrl+Z restores everything that Archive took.

In each project folder, top-level threads that are idle and read, hold no draft
or pending question, aren't pinned, have only such subthreads, whose pull
requests are merged, closed or absent, and with no activity for over a day fold
into one "N older" line at the folder's end; its tooltip states that
rule. A thread whose PR state isn't known yet stays out, so without bb's GitHub PR
Status plugin a thread with an environment never folds. Clicking the line shows
them above it and turns it into "Hide older" with an "Archive these" button.
That button works like a finished fold's Archive across all of them: bb's own
Archive with its confirmation and Undo, worktrees with changes skipped, and a
skip count before it starts. Once an archive run ends, each thread it skipped
for changes stays listed with a pencil marker until a later run finds it clean.
A run cancelled at the skip count marks nothing. Opening a thread never moves it across the fold:
one opened from the expanded list stays there, one opened from outside stays out until another
thread is opened. The Pinned group, Status and flat grouping, and
the archived view don't fold older threads.

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
Booleans: `showGithub`, `showAutomations`, `showRecent` (Recent Activity, off by default), `showSubagents`, `showAge`,
`foldOnDrag` (fold every block while a section or project is dragged), `reduceMotion` (no folder, reorder, hover or status-spinner animation).
Select: `providerIconStyle` (`tint` or `monochrome`); `needsYouPullRequests` (`linked`, the default:
PRs of the user's threads with failing checks, conflicts or changes requested; `all`: every GitHub
Folder item; `none`).
Numbers (1–50): `recentLimit` (Recent Activity rows), `recentMoreLimit` (rows after Show more).
The order of Pull requests, Automations and Recent Activity, the project order, and which groups are
folded are not settings: each browser client keeps them itself. The user changes them in the
sidebar by dragging a header or from its right-click menu; the Sections menu (the
sliders icon beside the search field) turns hidden ones back on, and its
tooltip counts them. A section header's actions (such as +) appear on hover just
before its count; clicking the count or summary folds the section like its title.

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

- Last activity (default): most recently active first, by bb's own activity time,
  so opening or reading a thread does not move it. bb sets that time when a thread
  starts, when a top-level thread finishes a turn and when any thread fails, so a
  subthread counts from its spawn until it fails. The row's age shows the same time.
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
view even after its last thread is archived or deleted. An empty folder draws
only its header, with no count and no rows; hovering the header shows its +
button, which starts a new chat in that project. Used projects are stored
on the bb server and seeded from existing active and archived threads, so the
folders survive reloads and appear on other clients. A browser cache keeps them
visible during a failed history read. Deleting a project removes its folder;
new projects without threads stay hidden. The Archived view continues to show
only folders with archived threads. Threads deleted before this feature was
installed cannot be recovered from history.
