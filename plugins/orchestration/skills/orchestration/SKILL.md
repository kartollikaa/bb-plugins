---
name: orchestration
description: Explains the Orchestration tab and context-card row on an orchestrator thread, what makes a subtask "needs you" or "stuck", and the exportScript setting. Use when the user asks about that tab, why it is missing, or why it shows a subtask as stuck.
---

# Orchestration

The Orchestration plugin adds a fixed side-panel tab, **Orchestration**, and a status row in the
thread's context card. Both appear only on a thread that an orchestrate ledger names on its first
line (`Orchestrator: thr_…`). Ledgers are read from `~/.claude/projects/*/orchestrate/*.md`; when
several name the thread, the newest wins.

## What it shows

- **Needs you:** subtasks at `question`, `ready` or `card`, a pending approval in any subtask's
  thread or the orchestrator's own, and every line under the ledger's «For the owner».
- **Stuck:** a `working` or `briefed` subtask with no report for 30 minutes (a report is the end of
  the thread's latest turn), or a third failed checks, review, done-when or conflicts stage across
  its open gates. A subtask at `gate` is waiting on the orchestrator and never counts as quiet.
- **Done:** `landed`, `verified`, `dropped`, or the ledger's status `closed`.

The Answer, Release and Not yet buttons only put a draft into the orchestrator's composer and focus
it. They never send. Keep ledger statuses and «For the owner» current: the tab reads nothing else.

## Setting

`exportScript`: path to orchestrate's `scripts/orchestration_ledger.py`. Empty means auto-discovery
in `~/.claude/plugins/cache/*/orchestrate/<version>/scripts/`, newest first. The export needs
orchestrate 0.11 or later.

```sh
bb plugin config orchestration set exportScript /path/to/orchestration_ledger.py
bb plugin config orchestration unset exportScript
```

If the tab says no installed orchestrate could export the ledger, point the setting at a newer script.
