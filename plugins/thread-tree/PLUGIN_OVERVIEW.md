A sidebar thread list built around agent work: the threads an agent spawns nest
under it, and the subagents it runs inside its own session show on its row.

## What you get

- Threads grouped by project, with Pinned on top. Each child thread sits under
  the thread that spawned it, at any depth, even when it lives in another
  project. Collapse a parent to fold its subtree; the dot on the fold shows the
  most urgent state inside it.
- Child threads are ordinary threads: open one, message it, pin, archive or
  split it with bb's own menu.
- Provider subagents (Claude Code `Agent` calls, Codex subagents) are not
  threads and cannot be messaged. They show as a counter with a status dot on
  the right of the parent's row; hover it to list each one with its type,
  state, duration and tokens.
- A parent thread (one with child threads or subagents) shows its own state as
  a dot before its title.
- Dot colors: blue (pulsing) running, green done, yellow needs your input, red
  error, gray stopped.
- `bb subagent-tree list` prints the same list from a terminal.

## How it works

The list reads bb's own thread data. Subagents come from each thread's event
log, read incrementally on the bb server; nothing leaves the machine. Collapse
state is kept per client.
