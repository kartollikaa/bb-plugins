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

- The page opens with the orchestrator thread's title and goal, then these sections (the tab is
  the same, narrower):
  It reads as plain language: parts by name, never by id, and no SHAs, message numbers, acks or
  gate ids (docs/human-view.md). Top to bottom:
  - **Status line:** one status word (Needs you, In progress, Waiting, Blocked, Paused, Stuck,
    Closed, Done, Planning), one sentence, a segmented progress bar with a segment per part (done,
    running, in progress, needs you, stuck, not started; hover names the part) and «N of M parts
    done». A reviewer is a stage of the part it reviews, never a part of its own.
  - **Needs you:** question and decision cards, a nudge for a stuck part («Ask the orchestrator
    about «name»»), then answered asks.
  - **Working now:** the running parts with their live step and age, then the orchestrator: what it
    is doing or waits for, or what it last said. The tab shows the running parts only.
  - **Next** (page only): the ledger's next step as a sentence.
  - **Plan:** a numbered timeline, read-only, in landing order: the ledger's parts in subtask order,
    the ones its «Landing queue» names re-seated in queue order, unlisted children last. Each step
    has its number (a ✓ once done) on a vertical line, its name, its state (`Done`, `Now · …`,
    `Waits on you · …`, `Next · …`) and one plain description line: the thread brief's first
    sentence, else the first «Done when» criterion, else the delivery, else the landing-queue entry. From nine steps the
    leading done steps fold into «Steps 1–N done». A step expands to Note, Last report, Checks,
    Review, Runs, Context, Details and Open thread. An open part whose session bb archived reads «Its
    session has ended; the ledger may be behind». The tab folds the whole Plan to «Plan · N of M
    done». To keep it current, keep «Subtasks» and «Landing queue» in landing order and give each
    brief a `<id>: <one sentence>` first line.
  - **Recently** (page only): the latest three decisions, newest first, without acks, takeovers and
    archiving; Show more opens Activity.
  - **Details for debugging**, folded: the raw status, the checkpoint as written, the orchestrator's
    full last report, its brief, ids, ledger file, sessions and handover. A ledger time ahead of this
    computer's clock shows as a clock time, and the fold says the clocks disagree.
  - **Work | Activity** under it.
  A part's name is the ledger's name, else its child thread's brief («D3: design …»), else its
  delivery's branch or file, else its status note, else its id.
- A free-text checkpoint (no Now block) shows only in Details. A last message that asks the owner
  while the ledger records no ask gets a needs-you card.
- **Needs you:** subtasks at `question`, `ready` or `card`, a pending approval in any subtask's
  thread or the orchestrator's own, and every `ask:` line under the ledger's «For the owner» (on an
  active ledger any line that is not a note is a wait). A `ready` card shows the status note, Delivery, Version and gate line;
  an open «For the owner» line naming that subtask or linking only its thread replaces it. A pending
  approval or question card shows the interaction's own question, options or command. Only such a
  card, held in another thread, has Open thread; every other card answers the orchestrator. When the
  orchestrator is idle with a question in the chat and none in its ledger, the card reads
  «Asked in the chat: <question>» with its choices or fields and «Open chat»: the question is the last
  interactive ```` ```ui ```` card's title and button labels, else the last `Waiting on you:` line,
  else the last paragraph.
- **Stuck:** a `working` or `briefed` subtask that has been quiet for `QUIET_MS`, or `FAILURES_STUCK` failed checks, review, done-when or conflicts
  stages across its open gates; both constants are in `src/view.ts`. A `blocked` subtask is stuck
  too, with the note after the status word as its cause. A subtask at `gate` is waiting
  on the orchestrator and never counts as quiet. Quiet is read from the live thread: a running turn is
  never quiet; an idle thread counts from its last report (the end of its latest turn). While something needs you, the subline and the
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

Two or more open `ask:` lines with `options:` share one questions card instead of a card each. Each
question shows its options as a radio row (arrow keys move the pick); an option ending
«(recommended …)» is preselected and shows the mark instead of the suffix, but only for questions
already there when the card opened: one that arrives later reads «new» and starts unpicked. A click on
the picked option clears it. Picks follow the question's title and options, not its ledger line.
«Send N answers» sends one message, one `Re «<title>»: <option>` line per picked question; a question
without a pick stays open. Two lines with one title show only the newer one; one answer answers both. The server checks
every line against the ledger's current quick replies and refuses a message that answers one question
twice. Several
answered asks show as one quiet list. Owner, on the change: «I see a lot of yellow blocks … is it
possible to just use the giant UI fancy block of questions for me to answer it?»

An answered `ask:` stops needing the owner at once: after a quick reply is sent from the card, or
once the orchestrator thread has a user message line `Re «<title>»: <non-empty answer>` (one message
may answer several asks, one line each, as a Generative UI form labelled `Re «<title>»` writes them; a form's `—` for an empty field is no answer) sent after that ask line appeared — dated from the server's
last read of the ledger without it, kept per ledger in plugin storage; the browser's remembered
quick replies obey the same date — the ask
leaves «needs you», the heading and the context-card dot, and shows as a quiet card «Answered
«answer» <age> ago · waiting for the orchestrator» with Other answer. It stays that way until the
line changes or leaves «For the owner». So on an answer, drop the ask line or replace it with a
`note:`; for a re-ask, reword the line (e.g. «Merge PR #12 (again)?»): an identical line re-added
between two reads keeps reading as answered. A done view's subline counts such pending answers. Answer, Other answer, Land it and Not yet only put a draft
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
- A hand-written `Q:`, `Q (asked 2026-11-16):` or `question:` line reads as an `ask:` (the
  parenthesis is dropped from the title), so a question written that way still reaches the owner;
  `Q (answered …):` stays a note. Write `ask:` with `options:` anyway, it gets
  quick replies.
- On an active ledger every other line that is not a note is a wait on the owner: a line that states a wait in
  free text shows as an ask card with a «written as free text» chip (from six such lines one grouped card,
  answered line by line, counted once). `note:`, `answered …`, `Q (answered …):`, `ask (draft):` and «Nothing waiting …»
  lines are information, including compact forms such as `Nothingwaitsonowner`: they show under Details and
  never count as needs you. Missing spaces are tolerated only in these no-wait prefixes; the original text
  is preserved. Write operational instructions as `note:` so they cannot become owner questions. On a `closed` ledger free-text lines
  are notes. An `ask:` with no title is a note too. An idle orchestrator whose last message ends with `Waiting on you:`
  or holds an interactive form while no ask is recorded gets a needs-you card.
- A ` | ` segment without one of the keys above stays with the field before it, so a title or a
  `why:` may contain ` | `.

## Asking a ledger question in the chat too

The view knows an ask is answered only from a message that starts `Re «<title>»: `, with `<title>`
exactly as on the `ask:` line, a leading `T2:` included (the card shows it without). A Generative UI card in the chat that asks the same question must send
that: `Button("Accept", Send("Re «<title>»: Accept"))`, a free-text button
`Send("Re «<title>»: ")`, or a Form field labelled `Re «<title>»`. Write the `ask:` line before showing the card: an answer
sent before the view read the line doesn't count. A card that sends anything else
(«Change the boards: …») leaves the ask waiting in the view. Whatever the answer's shape, once
you have it, drop the line or replace it with a `note:`; the view reads nothing else. Seen live:
the owner answered through a card's «Change something» button and the question stayed in the view.

## Showing a subtask's images in the chat

Generative UI (`Image`, `Gallery`, `Load`) reads only this thread's workspace, its thread storage
and `/tmp`; a path in a subtask's thread storage fails with «only files in this thread's workspace,
its thread storage or /tmp can be loaded». Copy the files into `$BB_THREAD_STORAGE/<folder>/` first
and reference them as `$BB_THREAD_STORAGE/<folder>/<file>`.

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

Needs you, Working now and the Plan stay above. Work shows the plan with meaningful
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

Details includes Brief: the ledger's Markdown result, or completed and remaining task records for
older ledgers. Outcome notes stay visible. A missing
brief is never replaced with an invented success claim. New exports may provide `status_raw`
and `brief`; older v1 exports remain supported. Work and Activity retain revisions and evidence. The full last report (in Details) opens the
last assistant response in place, preserving its links; long reports explicitly say they were shortened.
A report is a conversation record, not independent verification of its claims.

Local evidence links in Brief and checkpoint resolve from the ledger file; report links resolve
from the orchestrator workspace. Ordinary activation captures the click before Markdown navigation and opens BB's host-owned
file preview in an evidence dialog, using explicit thread-storage, workspace or host identity. Ledger file routing is enabled only after the ledger contents match on
that host. If its host cannot be established, the UI reports that the file location is unavailable.
The phase remains visible even when the ledger has no goal.

Every local evidence target requires confirmed source-host provenance. A matching workspace or
thread-storage pathname prefix never overrides a failed ledger identity check.

Work summary counts are derived from the existing ledger and BB thread state. Evidence recorded
is a record count, never a passed-check count. Expand a task to inspect dependencies, criteria,
evidence links and recorded revision. Dependency buttons select that task in All work. Missing
evidence/revision remain explicit; requirements do not certify results. No GenUI installation
is required and no new refresh service is introduced.

Chat questions use **Answer** to reveal/focus the orchestrator composer, or **Show question** when
a child conversation must first be replaced. These actions preserve drafts and never send.
Only ledger-offered answers use the reply endpoint; extracted UI choices are supporting context.
Keep the same short ask title in the ledger and closing line: the view matches titles ignoring
case and punctuation, not meaning. An unrelated ask does not suppress the chat question. Matching
answered asks remain quiet unless a later turn re-asks; missing turn timing is not proof of a
re-ask. Details contains the matching diagnostic. Only the latest report is inspected; old UI
cards are not searched. Keep follow-ups in separate context, outside the short question title.


## Source integrity and live descendants

A completed coordinator can still have active child work. The view follows explicit BB
parent links from the orchestrator and ledger-linked sessions, including nested coordinators,
and shows running or pending descendants even when their coordinator's delivery is finished.
Idle descendants alone do not establish unfinished work or completion. The ledger's recorded
statuses remain unchanged. A running orchestrator also keeps the overall status in progress.

Only one ledger may name an orchestrator in the scanned project directories. Multiple matches
show a source error instead of selecting by modification time. Keep history outside the scanned
`orchestrate/` directory or remove its Orchestrator header. Filenames do not establish authority.
The view also rejects exports that omit identifiable task rows under Subtasks, including a table
split by a blank line. Repair the source table; the view does not reconstruct statuses from prose.
This coverage guard checks task identifiers, not the truth or completeness of the owner's plan.
Live descendants are limited to the BB threads available to the view; missing activity is not
proof of completion. Exporter validation and keeping the ledger current remain orchestrate's
responsibility.
