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

- Plain sidebar thread links open the workspace directly, using a preloaded owner index and live
  parent links. Unknown or archived ancestry resolves before navigation. A later click or route
  change cancels pending navigation. Full chat remains a per-thread choice in browser storage;
  the context-card row clears it and opens the view again. Message links, modified clicks, new
  windows and downloads keep bb’s behavior.
- Thread Tree's button and keyboard requests use its cancelable `thread-tree:open-thread`
  window event to open the workspace directly. bb has no before-navigation plugin hook: cold deep
  links and navigation from other plugins may still wait for bb's context or an ownership lookup.
- No redirect while threads are split side by side (bb has no plugin slot for a thread's main area,
  so the view would replace the whole split), and none when a thread becomes an orchestrator while
  it is open.
- **Chat** in the view's title bar shows or hides the rail. On a narrow page it opens as a sheet
  from the bottom with a header and a close chevron; Esc or a tap above it closes it too. On touch,
  a vertical drag anywhere on the folded dock opens it; open, the header and composer drag it down
  and the transcript does once scrolled to its top (`sheetGestureOwner`, `sheetSettles` in
  `src/route.ts`). On a phone the title bar shows only Full chat. The rail's width can be dragged and is remembered.
- While the chat is folded, its composer stays docked under the view (the owner can delegate from
  there). The composer shows in one place only: the rail or sheet when open, the dock otherwise.
- The view for a thread no ledger names says so and offers **Open chat**.
- **Orchestration view** switch, last in the view's title bar: off goes to bb's thread view and
  stops the redirect for all orchestrators. bb's thread header shows an **Orchestration view** button
  in the same place (bb renders header actions as labelled buttons, not switches; at compact width
  it folds into the thread menu); it turns the setting back on and opens the view.

## What it shows

- **Recap**, on top: the orchestrator thread's title, goal and overall phase, with the recorded
  status qualification when available. The full checkpoint is expandable in Brief; decisions stay
  in Activity.
- **Needs you:** subtasks at `question`, `ready` or `card`, a pending approval in any subtask's
  thread or the orchestrator's own, and every `ask:` line under the ledger's «For the owner» (any
  other line there is a note).
- **Stuck:** a `working` or `briefed` subtask that hasn't reported for `QUIET_MS` (a report is the
  end of the thread's latest turn), or `FAILURES_STUCK` failed checks, review, done-when or conflicts
  stages across its open gates; both constants are in `src/view.ts`. A `blocked` subtask is stuck
  too, with the note after the status word as its cause. A subtask at `gate` is waiting
  on the orchestrator and never counts as quiet. While something needs you, the subline and the
  context-card row still name a stuck agent.
- **Done:** `landed`, `verified` or `dropped`. A closed ledger with open work shows a conflict. A done subtask whose
  thread is running again shows as working («Running again · …») and keeps the view out of «done».
- **Running children:** child threads of the orchestrator (bb's `parentThreadId`) the ledger doesn't
  name. One titled `… · <id>` (uppercase id: S11, O8, R2b) fills that ledger row's empty session,
  running and newest first; otherwise it gets its own row («Running, not in the ledger yet»), never a
  second row under an id that already has a thread, while a turn runs, or a card while it waits on an
  approval (a card even before the ledger has subtasks).
  Idle unlisted children are left out. To have a child show under its subtask, end its title with
  ` · <subtask id>` or record its thread in the Subtasks table.

A quick-reply option button sends `Re «<title>»: <option>` to the orchestrator thread itself, once
per click, with `queue-if-active`: mid-turn it waits in bb's queue. The server sends only texts the
ledger's current asks offer, and only to the thread the ledger names as orchestrator. Owner, on the
change: «when I click on the button on the suggestion it just puts the text in the chat. I suggest
that it should send the message by itself».

An answered `ask:` stops needing the owner at once: after a quick reply is sent from the card, or
once the orchestrator thread has a user message line `Re «<title>»: <non-empty answer>` (one message
may answer several asks, one line each) sent after that ask line appeared — dated from the server's
last read of the ledger without it, kept per ledger in plugin storage; the browser's remembered
quick replies obey the same date — the ask
leaves «needs you», the heading and the context-card dot, and shows as a quiet card «Answered
«answer» <age> ago · waiting for the orchestrator» with Other answer. It stays that way until the
line changes or leaves «For the owner». So on an answer, drop the ask line or replace it with a
`note:`; for a re-ask, reword the line (e.g. «Merge PR #12 (again)?»): an identical line re-added
between two reads keeps reading as answered. A done view's subline counts such pending answers. Answer, Other answer, Release and Not yet only put a draft
into the orchestrator's composer and focus it, wherever the composer currently is (rail, sheet or
dock); they never send. Keep ledger statuses and «For the owner» current: the tab reads nothing else.

## Writing «For the owner»

One bullet per item. A bullet that starts with `ask:` becomes a card that says what is asked:

```
- ask: Merge kartollika-ai-hub#38 | why: S5 passed review and checks | link: kartollikaa/kartollika-ai-hub#38 | thread: thr_abc123 | options: Go as you recommend / Not now
- note: Store PR get-bb/marketplace#958 waits on a maintainer label
```

- An `ask:` whose title starts with a subtask id (`ask: T2: Approve the draft`, orchestrate 0.13+)
  shows as that subtask's card, with its thread as a button; the reply still quotes the full title.
- `ask:` is the card's title: what the owner is asked to do or decide. The other fields are
  optional, separated by ` | `, in any order: `why:` (one line of context), `link:` (URLs or
  `owner/repo#N`, space-separated), `thread:` (bb thread ids), `options:` (quick replies separated by
  ` / `). A GitHub link reads `repo#N` on its button. Each option sends `Re «<title>»: <option>` to the orchestrator; Other answer fills the composer with
  `Re «<title>»: `.
- Only `ask:` is an ask. `note:` and every other line («Nothing waiting.», «answered 2026-11-14:
  …») is information: it shows under History as a note and never counts as needs you. An `ask:`
  with no title is a note too. Owner, on the change: «The dialog keep showing even when i answered».
- A ` | ` segment without one of the keys above stays with the field before it, so a title or a
  `why:` may contain ` | `.

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

## Work and activity

Now keeps the existing attention cards and live team. Work shows the plan with meaningful
task names (the delivery description when no name was recorded), status, dependencies and
filters for remaining or finished work. Expand a task for its scope, acceptance criteria,
delivery evidence, revision and conversation. Shared criteria stay labeled with their group;
criteria are requirements, not proof that each point passed. Delivery narrative is the evidence.

Activity shows decisions, deliveries and session handovers, latest recorded activity first.
Gate stages are grouped into one delivery with readable evidence rather than repeated
unknown-state rows. Placeholder stages are omitted; substantive evidence is retained even
when no state or date could be inferred. Undated records remain undated. Archived gates
keep their reference. Filter by task and use Earlier activity for older records.

Task names, coverage and outcomes come from the ledger; missing facts are not invented.
A finished task running again is labeled Active again (Needs input again for an approval).
It moves back to Remaining. Finished includes dropped tasks, whose status remains visible.

## Navigating the team

Opening a child thread opens its nearest ancestor orchestration with that child's conversation
in the chat rail (or the open chat sheet on a phone). The URL records both the orchestration
and selected conversation, so reloading restores them. Selecting the orchestrator opens its
own conversation. An unrelated thread opens normally; another orchestrator switches the
whole workspace. Full chat opens the selected conversation outside the workspace, and the
existing view switch and split-pane opt-out still apply.

Task conversation buttons select the child's chat inside the workspace. Owner questions
still address the orchestrator: starting an owner reply first opens its composer.
The chat header names the selected conversation. Work and the live team separate Active,
Idle / waiting, Planned and Done. A running thread or pending input counts as Active;
a delivered task waiting for its next gate is Idle / waiting, never Planned.

## Overall state and brief

The header shows the orchestration phase independently of owner attention. Explicit blocked,
paused and closed states take precedence; a closed ledger with open or running work shows a
conflict. Idle tasks never count as running agents. Finished tasks awaiting ledger closure say so.
Missing live activity is not evidence of completion.

Now includes Brief: the ledger's Markdown result, or completed and remaining task records for
older ledgers. The full Current checkpoint is expandable, and outcome notes stay visible. A missing
brief is never replaced with an invented success claim. New exports may provide `status_raw`
and `brief`; older v1 exports remain supported. Work and Activity retain revisions and evidence. Latest orchestrator report opens the
last assistant response in place, preserving its links; long reports explicitly say they were shortened.
A report is a conversation record, not independent verification of its claims.

Local evidence links in Brief and checkpoint resolve from the ledger file; report links resolve
from the orchestrator workspace. Ordinary activation captures the click before Markdown navigation and opens BB's host-owned
file preview in an evidence dialog, using explicit thread-storage, workspace or host identity. Ledger file routing is enabled only after the ledger contents match on
that host. If its host cannot be established, the UI reports that the file location is unavailable.
The phase remains visible even when the ledger has no goal.

Every local evidence target requires confirmed source-host provenance. A matching workspace or
thread-storage pathname prefix never overrides a failed ledger identity check.
