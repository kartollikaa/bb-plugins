---
name: orchestration
description: Explains the Orchestration tab and context-card row on an orchestrator thread, what makes a subtask "needs you" or "stuck", and the exportScript setting. Use when the user asks about that tab, why it is missing, or why it shows a subtask as stuck.
---

# Orchestration

The Orchestration plugin opens an orchestrator's thread on a full-page **Orchestration view**
(`/plugins/orchestration/orchestrator/<thread id>`) with the thread's chat in a rail on the right,
and adds a fixed side-panel tab, **Orchestration**, and a status row in the thread's context card. Both appear only on a thread that an orchestrate ledger names on its first
line (`Orchestrator: thr_…`). Ledgers are read from `~/.claude/projects/*/orchestrate/*.md`; when
several name the thread, the newest wins.

## Getting between the view and the chat

- The thread redirects to the view unless the owner last picked **Full chat** for it (remembered per
  thread in this client's browser storage). The context-card row in the thread view clears that and
  opens the view again.
- **Chat** in the view's title bar shows or hides the rail. Below 900px of page width the rail is a
  drawer; Esc closes it. The rail's width can be dragged and is remembered.
- bb has no plugin slot for a thread's main area. A thread opened in a split pane redirects too,
  and the view replaces the whole route.

## What it shows

- **Needs you:** subtasks at `question`, `ready` or `card`, a pending approval in any subtask's
  thread or the orchestrator's own, and every line under the ledger's «For the owner».
- **Stuck:** a `working` or `briefed` subtask that hasn't reported for `QUIET_MS` (a report is the
  end of the thread's latest turn), or `FAILURES_STUCK` failed checks, review, done-when or conflicts
  stages across its open gates; both constants are in `src/view.ts`. A subtask at `gate` is waiting
  on the orchestrator and never counts as quiet. While something needs you, the subline and the
  context-card row still name a stuck agent.
- **Done:** `landed`, `verified`, `dropped`, or the ledger's status `closed`.

The Answer, Release and Not yet buttons only put a draft into the orchestrator's composer and focus
it; on the view they open the rail first. They never send. Keep ledger statuses and «For the owner» current: the tab reads nothing else.

## Setting

`exportScript`: path to orchestrate's `scripts/orchestration_ledger.py`. Empty means auto-discovery
in `~/.claude/plugins/cache/*/orchestrate/<version>/scripts/`, newest first. Only orchestrate versions that ship the `export` command work. A failed export is
retried only after the ledger or this setting changes.

```sh
bb plugin config orchestration set exportScript /path/to/orchestration_ledger.py
bb plugin config orchestration unset exportScript
```

If the tab says no installed orchestrate could export the ledger, point the setting at a newer script.
