A sidebar thread list built around agent work: the threads an agent spawns nest
under it, and the subagents it runs inside its own session show on its row.

## What you get

- Automations at the very top: each scheduled automation with its status dot
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
- `bb subagent-tree list` prints the same list from a terminal.

## How it works

The list reads bb's own thread data. Subagents come from each thread's event
log, read incrementally on the bb server; nothing leaves the machine. Collapse
state, grouping, project order, and the Recent Activity length are kept per
client.
