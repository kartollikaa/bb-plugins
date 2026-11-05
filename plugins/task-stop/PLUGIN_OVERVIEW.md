Stop one background command or background agent without interrupting the whole turn: a stop button
sits on every row of bb's "Running background command / agent" card.

## What you get

- A ■ button on each running background command and background agent above the composer.
- A command stops at once: its processes are killed, the agent sees it end, and no turn is spent.
- An agent is stopped by the thread's own agent: the plugin asks it to call `TaskStop` on that task,
  which takes one short turn.

## Requirements

Claude Code threads. Killing a command directly needs the thread to run on the same machine as the bb
server (macOS or Linux with `lsof`); otherwise the plugin asks the agent to stop it.

## Privacy

Everything stays on your bb server. The plugin reads the thread's own events and sends a message only
to that thread.
