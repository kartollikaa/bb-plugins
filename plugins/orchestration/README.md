# Orchestration

A bb plugin for threads that orchestrate other threads with the
orchestrate Claude Code plugin. It answers one
question: does anything need you, and is the team moving?

- **Orchestration tab.** A fixed side-panel tab, shown only on a thread that a ledger's first line
  (`Orchestrator: thr_…`) names. On top: one status sentence. Below it: a card per thing that waits
  on you, then the team with one row per subtask, then a fold with the goal and history.
- **Context-card row.** The same status sentence in the thread's context card. A click opens the tab.
- **Answer, Release, Not yet** only start a reply in the orchestrator's composer. Nothing is sent
  until you send it.

## What counts as what

- **Needs you:** a subtask at `question` or `ready`, one waiting for its card, a pending approval in
  any subtask's thread or the orchestrator's own, and each line under the ledger's «For the owner».
- **Stuck:** a `working` or `briefed` subtask with no report for 30 minutes, or a third failed
  check, review, done-when or conflict stage. A report is the end of the thread's latest turn.
- **Done:** `landed`, `verified` or `dropped`.

## Data

- The ledger comes from `orchestration_ledger.py export` (schema `orchestrate-ledger-export` v1),
  which ships with orchestrate 0.11. The plugin finds the script in Claude Code's plugin cache, or
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
