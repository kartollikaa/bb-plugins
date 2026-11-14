---
name: orchestration
description: Explains the Orchestration view an orchestrator thread opens on (chat in a side rail, Full chat to go back), the Orchestration tab and context-card row, what makes a subtask "needs you" or "stuck", the Orchestration view switch and its orchestrationView setting, and the exportScript setting. Use when the user asks about that view, switch or tab, why a thread opens on it or doesn't, or why it shows a subtask as stuck.
---

# Orchestration

The Orchestration plugin opens an orchestrator's thread on a full-page **Orchestration view**
(`/plugins/orchestration/orchestrator/<thread id>`) with the thread's chat in a rail on the right,
and adds a fixed side-panel tab, **Orchestration**, and a status row in the thread's context card. Both appear only on a thread that an orchestrate ledger names on its first
line (`Orchestrator: thr_…`). Ledgers are read from `~/.claude/projects/*/orchestrate/*.md`; when
several name the thread, the newest wins.

## Getting between the view and the chat

- The thread redirects to the view when it opens, unless the owner last picked **Full chat** for it
  (remembered per thread in this client's browser storage). The context-card row in the thread view
  clears that and opens the view again.
- No redirect while threads are split side by side (bb has no plugin slot for a thread's main area,
  so the view would replace the whole split), and none when a thread becomes an orchestrator while
  it is open.
- **Chat** in the view's title bar shows or hides the rail. On a narrow page it opens as a sheet
  from the bottom; Esc or a tap above it closes it. The rail's width can be dragged and is remembered.
- While the chat is folded, its composer stays docked under the view (the owner can delegate from
  there). The composer shows in one place only: the rail or sheet when open, the dock otherwise.
- The view for a thread no ledger names says so and offers **Open chat**.
- **Orchestration view** switch, last in the view's title bar: off goes to bb's thread view and
  stops the redirect for all orchestrators. bb's thread header shows an **Orchestration view** button
  in the same place (bb renders header actions as labelled buttons, not switches; at compact width
  it folds into the thread menu); it turns the setting back on and opens the view.

## What it shows

- **Needs you:** subtasks at `question`, `ready` or `card`, a pending approval in any subtask's
  thread or the orchestrator's own, and every ask under the ledger's «For the owner» (`note:` lines
  and «Nothing waiting.»-style status lines are not asks).
- **Stuck:** a `working` or `briefed` subtask that hasn't reported for `QUIET_MS` (a report is the
  end of the thread's latest turn), or `FAILURES_STUCK` failed checks, review, done-when or conflicts
  stages across its open gates; both constants are in `src/view.ts`. A subtask at `gate` is waiting
  on the orchestrator and never counts as quiet. While something needs you, the subline and the
  context-card row still name a stuck agent.
- **Done:** `landed`, `verified`, `dropped`, or the ledger's status `closed`.

A quick-reply option button sends `Re «<title>»: <option>` to the orchestrator thread itself, once
per click, with `queue-if-active`: mid-turn it waits in bb's queue. The server sends only texts the
ledger's current asks offer, and only to the thread the ledger names as orchestrator. Owner, on the
change: «when I click on the button on the suggestion it just puts the text in the chat. I suggest
that it should send the message by itself». The card reads «Sent «option» · <age> ago», with Send again
and Other answer, until an ask with that title and those options leaves the ledger. The owner's
browser can keep that state for days, so drop an answered ask from «For the owner» and reword a
re-ask (e.g. «Merge PR #12 (again)?») rather than re-adding the same line. Answer, Other answer, Release and Not yet only put a draft
into the orchestrator's composer and focus it, wherever the composer currently is (rail, sheet or
dock); they never send. Keep ledger statuses and «For the owner» current: the tab reads nothing else.

## Writing «For the owner»

One bullet per item. A bullet that starts with `ask:` becomes a card that says what is asked:

```
- ask: Merge kartollika-ai-hub#38 | why: S5 passed review and checks | link: kartollikaa/kartollika-ai-hub#38 | thread: thr_abc123 | options: Go as you recommend / Not now
- note: Store PR get-bb/marketplace#958 waits on a maintainer label
```

- `ask:` is the card's title: what the owner is asked to do or decide. The other fields are
  optional, separated by ` | `, in any order: `why:` (one line of context), `link:` (URLs or
  `owner/repo#N`, space-separated), `thread:` (bb thread ids), `options:` (quick replies separated by
  ` / `). A GitHub link reads `repo#N` on its button. Each option sends `Re «<title>»: <option>` to the orchestrator; Other answer fills the composer with
  `Re «<title>»: `.
- `note:`, and a status line that opens with «Nothing», «Nothing waiting», «Nothing pending» or
  «Nothing waits on the owner» followed by a full stop or the end, is information, not an ask: it
  shows under Goal and history and never counts as needs you. «Nothing lands until you approve…» is
  still an ask; when in doubt, write `note:` or `ask:`.
- A ` | ` segment without one of the keys above stays with the field before it, so a title or a
  `why:` may contain ` | `.
- Any other line stays a card with its full text, expandable, with its URLs, `owner/repo#N` refs and
  thread ids as buttons.

## Settings

`orchestrationView` (boolean, default on): whether an orchestrator's thread opens on the view. The
title-bar switch and the thread-header button write this same setting; it is global, not per thread.
**Full chat** is the per-thread choice and lives in the client's browser storage.

```sh
bb plugin config orchestration set orchestrationView false
bb plugin config orchestration unset orchestrationView
```

`exportScript`: path to orchestrate's `scripts/orchestration_ledger.py`. Empty means auto-discovery
in `~/.claude/plugins/cache/*/orchestrate/<version>/scripts/`, newest first. Only orchestrate versions that ship the `export` command work. A failed export is
retried only after the ledger or this setting changes.

```sh
bb plugin config orchestration set exportScript /path/to/orchestration_ledger.py
bb plugin config orchestration unset exportScript
```

If the tab says no installed orchestrate could export the ledger, point the setting at a newer script.
