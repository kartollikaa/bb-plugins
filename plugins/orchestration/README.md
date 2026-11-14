# Orchestration

A bb plugin for threads that orchestrate other threads with the
orchestrate Claude Code plugin. It answers one
question: does anything need you, and is the team moving?

- **Orchestration view.** Opening an orchestrator's thread lands on a full-page view of its team,
  with the thread's chat in a rail on the right. **Chat** in the title bar folds the rail away;
  on a narrow page it becomes a drawer that Esc closes. **Full chat** goes back to bb's normal
  thread view and remembers that choice for the thread; the context-card row there brings the view
  back. The redirect happens only when the thread opens, and never while threads are split side by
  side.
- **Orchestration view switch.** The last control in the view's title bar. Off goes to bb's thread
  view and stops the redirect for every orchestrator. In bb's thread view the same place holds an
  **Orchestration view** header button that turns it back on and opens the view. The switch writes
  the plugin setting `orchestrationView` (on by default), so the switch and Settings → Plugins are
  one value. Full chat stays a per-thread choice.
- **Orchestration tab.** The same content as a fixed side-panel tab, shown only on a thread that a ledger's first line
  (`Orchestrator: thr_…`) names. On top: one status sentence. Below it: a card per thing that waits
  on you, then the team with one row per subtask, then a fold with the goal and history.
- **Context-card row.** The same status sentence in the thread's context card. A click opens the view.
- **Answer, Release, Not yet** only start a reply in the orchestrator's composer. Nothing is sent
  until you send it.

## Why this layout

The orchestrator's job is to run its team, so its thread opens on the orchestration view and keeps
the chat open in a rail beside it. bb doesn't let a plugin replace or shrink a thread's
conversation, so the view is a plugin page (`/plugins/orchestration/orchestrator/<thread>`) that the
orchestrator's thread redirects to, and it embeds that thread's chat with bb's `ThreadChat`. The
rail is the plugin's own column, not bb's side panel, so Answer can always open it and focus the
composer. A bottom sheet was rejected because chat and the team list both need height; bb's own side
panel was rejected because a plugin can't guarantee to reveal it from Answer.

bb's thread header only takes plugin actions as outline buttons with a label (no switch, no icon),
placed after the workspace's Open button and folded into the thread menu at compact width. So the
view shows a real switch, the thread view shows a button with the same label at the right end of the
same title bar.

## What counts as what

- **Needs you:** a subtask at `question` or `ready`, one waiting for its card, a pending approval in
  any subtask's thread or the orchestrator's own, and each line under the ledger's «For the owner».
- **Stuck:** a `working` or `briefed` subtask that hasn't reported for too long, or one whose
  checks, review, done-when or conflict stages keep failing. A report is the end of the thread's
  latest turn. Both limits are the owner's and live in `src/view.ts` (`QUIET_MS`, `FAILURES_STUCK`).
  A stuck agent is named even while something else needs you.
- **Done:** `landed`, `verified` or `dropped`.

## Data

- The ledger comes from `orchestration_ledger.py export` (schema `orchestrate-ledger-export` v1),
  in orchestrate versions that have the export command. The plugin finds the script in Claude Code's plugin cache, or
  takes the path from the `exportScript` setting.
- Ledgers are read from `~/.claude/projects/*/orchestrate/*.md`; the newest one naming the thread wins.
- Live state (status, pending approvals, last report, model, effort, context use, last reply) comes
  from bb's thread API.

Runs on the bb server's own machine; it reads local files.

## Develop

```sh
npm install
npm test && npm run typecheck && bb plugin build
bb plugin reload orchestration
```

MIT.
