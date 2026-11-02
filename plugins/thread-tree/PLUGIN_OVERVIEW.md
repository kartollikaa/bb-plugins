A sidebar thread list built around agent work: the threads an agent spawns nest
under it, and the subagents it runs inside its own session show on its row.

## What you get

- A GitHub folder at the top: open pull requests that need you, most urgent
  first. Review requests come first, then your own PRs with changes requested,
  failing checks, conflicts, or an approval and nothing blocking the merge,
  then PRs assigned to you or mentioning you. Each row shows the title and a
  short reason; a click opens the PR. Hover a row for its `repo#number` and a
  snooze button that hides it until the PR changes. The customize button in
  the folder header picks the sources (review requests with or without team
  requests, your PRs only when they need you or all of them, assigned,
  mentions), drafts and organizations, and refreshes. The arrow opens
  GitHub's pull requests page. It reads every gh login on the bb server
  machine, `~/.config/gh-*` profiles included; without gh it says it can't
  reach GitHub.
- Automations below it: each scheduled automation with its status dot
  and next run; hover to run it now or pause and resume it. Clicking one opens
  its last run's thread. Paused ones fold under an "N paused" toggle. It reads
  bb's own Automations plugin and hides itself when that plugin is off.
- Recent Activity below it: the most recently active threads, child threads
  included, newest first, whatever grouping the list below uses. Show more
  extends it; the project is in each row's tooltip.
- Below it, Threads grouped by Project (folder icons), by Status (needs input,
  error, working, done; a parent files under the most urgent state in its
  subtree), or None, with Pinned on top. Pick it from the Group by menu.
  Projects keep a fixed order you set by dragging their headers, or follow
  recent activity (Project order in the same menu).
- The Archived toggle next to Group by switches Threads to archived threads,
  in the same grouping and nesting; Show more loads older pages. Hovering an
  archived row offers bb's own Unarchive. Automations and Recent Activity stay
  on active threads.
- Each child thread sits under the thread that spawned it, at any depth, even
  when it lives in another project. Collapse a parent to fold its subtree; the
  dot on the fold shows the most urgent state inside it.
- Child threads are ordinary threads: open one, message it, pin, archive or
  split it with bb's own menu. Hovering a row shows Archive and the thread
  menu over the end of the row; Archive is bb's own, with its confirmation
  for threads that have children.
- Provider subagents (Claude Code `Agent` calls, Codex subagents) are not
  threads and cannot be messaged. They show as a counter with a status dot on
  the right of the parent's row; hover it to list each one with its type,
  state, duration and tokens.
- Every thread shows its own state as a dot before its title; a thread whose
  turn failed (an app exit, a daemon disconnect) is red and gets a Retry button.
- Dot colors: blue (pulsing) running, green done, yellow needs your input, red
  error, gray stopped.
- `bb thread-tree list` prints the same list from a terminal.

## How it works

The list reads bb's own thread data. Subagents come from each thread's event
log, read incrementally on the bb server; nothing leaves the machine. The
GitHub folder runs one GraphQL search per gh login through the `gh` CLI on the
bb server, so only GitHub sees those requests. Collapse state, grouping,
project order, the Archived toggle, the Recent Activity length, and the GitHub
folder's filters and snoozes are kept per client.

## Requirements

The GitHub folder needs the `gh` CLI signed in on the bb server machine.
