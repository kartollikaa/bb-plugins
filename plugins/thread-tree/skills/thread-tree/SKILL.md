---
name: thread-tree
description: List the provider subagents (Claude Code Agent calls, Codex subagents) a bb thread has run, with their state, using `bb thread-tree list`.
---

# Thread Tree

The Thread Tree plugin replaces the sidebar thread list. Child threads nest
under the thread that spawned them; provider subagents, which are not threads
and cannot be messaged, show as a counter with a status dot on the parent's row.

When the GitHub Folder plugin is installed, the list's top section is its
folder of pull requests that need the user. Use that plugin's
`bb github-folder list` to read it.

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

## Settings

`bb plugin config thread-tree` lists them; `bb plugin config thread-tree set <key> <value>` changes one.
Booleans: `showGithub`, `showAutomations`, `showRecent`, `showProviderIcon`, `showSubagents`, `showAge`.
Numbers (1–50): `recentLimit` (Recent Activity rows), `recentMoreLimit` (rows after Show more).
The order of GitHub, Automations and Recent Activity, the project order, and which groups are
folded are not settings: each browser client keeps them itself. The user changes them in the
sidebar by dragging a header or from its right-click menu.

## Making a subagent you can talk to

A provider subagent cannot be messaged. To get one that can, spawn a child
thread instead: `bb thread spawn --parent-self ...` from inside the parent, or
`--parent-thread <id>` from elsewhere. It appears nested under the parent in
the sidebar and accepts messages like any thread.
