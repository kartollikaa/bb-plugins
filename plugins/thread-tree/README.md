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

The GitHub and Automations sections start folded, with a summary in the header
instead of a bare count: GitHub's leads with failing checks, conflicts and changes
requested, then the total ("1 failing · 1 conflicts · 5"); Automations' gives
failed and running automations and the soonest next run ("1 failed · next in
12m"). An expanded PR row draws its most urgent reason as a tinted icon, then the
title and repo; the number and reasons are in the tooltip. Hover offers "Open its
thread" when one of your threads links the PR, Open on GitHub, and Snooze.
`src/sectionSummaries.ts` holds the summaries, the reason glyphs and which
sections start folded.

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
`bb-plugins · 2/4 done · 1 needs you`. Clicking it opens the orchestrator like
any row, leaving the tree below as it is.
Finished orchestrations drop out by themselves; the section hides when empty
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
or pending question, aren't pinned or open, have only such subthreads, whose
pull requests are merged, closed or absent, and where nothing changed for over a
day fold into one "N older" line at the folder's end; its tooltip states that
rule. A thread whose PR state isn't known yet stays out. Clicking the line shows
them above it and turns it into "Hide older" with an "Archive these" button.
That button works like a finished fold's Archive across all of them: bb's own
Archive with its confirmation and Undo, worktrees with changes skipped, and a
skip count before it starts. Once an archive run ends, each thread it skipped
for changes stays listed with a pencil marker until a later run finds it clean.
A run cancelled at the skip count marks nothing. The Pinned group, Status and flat grouping, and
the archived view don't fold older threads.

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

- `server.ts`: RPC `subagents`, `undoArchive`, `archiveScope`, `archiveClaim` and `archiveRelease`, the Automations and GitHub Folder proxies, and the `bb thread-tree` command.
- `src/githubFolder.ts`: the slice of the GitHub Folder plugin's view that the GitHub section draws.
- `src/sectionSummaries.ts`: the GitHub and Automations header summaries, PR reason glyphs, sections folded by default.
- `src/subagents.ts`: folds a thread's event log into its subagents.
- `src/tree.ts`: pure tree, grouping and subagent state logic.
- `src/orchestrations.ts`: the Orchestrations shortcuts, the folded rollup and bar, and the archive plan.
- `src/olderThreads.ts`: which of a folder's threads fold into "N older".
- `src/archiveRun.ts`: runs bb's Archive on each clean root in turn.
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
