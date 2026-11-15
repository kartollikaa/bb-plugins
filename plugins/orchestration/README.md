# Orchestration

A bb plugin for threads that orchestrate other threads with the
orchestrate Claude Code plugin. It answers one
question: does anything need you, and is the team moving?

- **Orchestration view.** Opening an orchestrator's thread lands on a full-page view of its team,
  with the thread's chat in a rail on the right. **Chat** in the title bar folds the rail away;
  on a narrow page the chat opens as a sheet from the bottom that Esc or a tap above it closes.
  On a touch screen the whole dock drags the sheet up. Open, its header and composer drag it down,
  the transcript scrolls first and hands over at its top, and the chevron closes it; a flick or a
  quarter of the way flips it. On a phone the title bar keeps only Full chat: the dock replaces Chat,
  and the switch stays in Settings and bb's thread header. The thread title is in the recap, not
  the breadcrumb.
  Whenever the chat is folded, bb's composer stays docked under the view, so a task can be
  delegated without opening the chat. The composer is never shown twice: it lives in the rail or
  sheet while that is open, and in the dock otherwise. **Full chat** goes back to bb's normal
  thread view and remembers that choice for the thread; the context-card row there brings the view
  back. Sidebar clicks choose the workspace before opening the conversation, using a preloaded
  owner index and bb’s live parent links. Missing ancestry resolves before navigation. Modified
  clicks and existing splits keep bb’s behavior. Thread Tree's button and keyboard requests
  use the same direct path. Cold deep links and navigation from other plugins can still wait
  for bb's thread context or an ownership lookup; bb exposes no before-navigation plugin hook.
- **Orchestration view switch.** The last control in the view's title bar. Off goes to bb's thread
  view and stops the redirect for every orchestrator. In bb's thread view the same place holds an
  **Orchestration view** header button that turns it back on and opens the view. The switch writes
  the plugin setting `orchestrationView` (on by default), so the switch and Settings → Plugins are
  one value. Full chat stays a per-thread choice.
- **Orchestration tab.** The same content as a fixed side-panel tab, shown only on a thread that a ledger's first line
  (`Orchestrator: thr_…`) names. On top: a recap (in the view, the orchestrator thread's title
  first), the goal and overall orchestration phase. The full checkpoint is expandable in Brief;
  dated decisions stay in Activity.
  Then one status sentence, a card per thing that waits on you, the team with one row per subtask,
  and a History fold.
- **Context-card row.** The same status sentence in the thread's context card. A click opens the view.
- **Questions share one card.** Two or more open questions with options show as one card: each
  question with its options, the recommended one preselected, and one «Send N answers» button that
  sends a single message. Click a pick again to clear it; a question you leave unpicked stays open. A
  question that arrives while the card is open is marked «new» and isn't preselected.
- **Quick replies send.** A click on an ask's option (Merge it, Not now) sends
  `Re «<title>»: <option>` to the orchestrator at once, as you asked: «when I click on the button
  on the suggestion it just puts the text in the chat. I suggest that it should send the message by
  itself». A busy orchestrator gets it in bb's queue, after its current turn. A failed send shows an
  error and brings the buttons back.
- **Answer, Other answer, Land it, Not yet** only start a reply in the orchestrator's composer.
  Nothing is sent until you send it.
- **Answers typed in the chat count too.** One message may answer several questions, one
  `Re «<title>»: <answer>` line each, the shape a Generative UI form labelled `Re «<title>»` writes.
  An answer of `—` (a form field left empty) leaves the question open.
- **An answered ask stops waiting on you at once.** Once a quick reply is sent, or a
  `Re «<title>»: <answer>` from you shows in the orchestrator chat after that ask line appeared,
  the ask leaves «needs you» and shows as a quiet card, «Answered «answer» 2m ago · waiting for the
  orchestrator», with Other answer and its links, until the orchestrator rewrites or removes the
  line. Owner, on the change: «The dialog keep showing even when i answered». One message may answer
  several asks, one `Re «…»:` line each. The server dates each ask line from the last time it read
  the ledger without it (kept in plugin storage), so an answer from before a re-ask doesn't close it,
  the server's or one this browser remembers. A line re-added between two reads can still look
  answered; reword a re-ask. When all subtasks are done, the subline counts answers still waiting
  on the orchestrator.

## Why this layout

The orchestrator's job is to run its team, so its thread opens on the orchestration view and keeps
the chat open in a rail beside it. bb doesn't let a plugin replace or shrink a thread's
conversation, so the view is a plugin page (`/plugins/orchestration/orchestrator/<thread>`) that the
sidebar opens directly; the view embeds the selected thread's chat with bb's `ThreadChat`. The
rail is the plugin's own column, not bb's side panel, so Answer can always open it and focus the
composer. bb's own side panel was rejected because a plugin can't guarantee to reveal it from Answer.

On a phone the rail doesn't fit, so the chat folds into a dock that shows only bb's composer. It is
the same `ThreadChat` as the rail and the sheet, so a draft, its attachments and the model choice
survive opening and folding the chat. A homemade input was rejected because it would lose them.

bb's thread header only takes plugin actions as outline buttons with a label (no switch, no icon),
placed after the workspace's Open button and folded into the thread menu at compact width. So the
view shows a real switch, the thread view shows a button with the same label at the right end of the
same title bar.

## What counts as what

- **Needs you:** a subtask at `question` or `ready`, one waiting for its card, a pending approval in
  any subtask's thread or the orchestrator's own, and each `ask:` line under the ledger's «For the
  owner» (any other line there is a note; see the format below).
- **A `ready` card** shows the ledger's note after `ready`, and what lands: Delivery, Version and the
  gate line. **Land it** drafts `<id> at <version>: go ahead and land it.` When an open «For the owner»
  line names that subtask (`T1: …`) or links only its thread, that line is the card instead.
- **A pending approval or question** shows what bb holds: the agent's question with its options, or
  the command, plan, permission or tool it asks to approve (`threads.interactions.list`, read only for
  the orchestrator, its ledger's subtasks and its child threads).
- **Open thread** appears only on a card whose prompt bb holds in another thread; every other card is
  answered to the orchestrator, which records the answer and passes it on.
- **Stuck:** a `working` or `briefed` subtask that hasn't reported for too long, or one whose
  checks, review, done-when or conflict stages keep failing, or one at `blocked` (orchestrate
  0.13+), which shows its cause. A report is the end of the thread's latest turn. Both limits are the owner's and live in `src/view.ts` (`QUIET_MS`, `FAILURES_STUCK`).
  A stuck agent is named even while something else needs you.
- **Done:** `landed`, `verified` or `dropped`. A done subtask whose thread runs a turn again shows
  in the team as working («Running again»), and the view isn't «done» while it runs.
- **Running children.** The orchestrator's own child threads (bb's parent link) join the team even
  before the ledger lists them, since the ledger lags behind spawns: a child whose title ends with a
  ledger row's id (`… · S11`) and that row has no session yet becomes that row's thread (a running
  or newer session wins over an idle old one); any other child shows as its own row, labelled by that
  id unless a row with that id already has a thread, while bb runs a turn in it, and as a card while
  it waits on an approval, also while the ledger has no subtasks yet. A done subtask whose thread
  stops on an approval is a card too. An idle child the ledger doesn't list stays out, so finished reviewers don't
  pile up. Running rows pulse their dot. Owner, on the change: «I don't see active Chile threads on
  orchestrator view, they just show as a island above prompt bar».

## «For the owner» format

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

## Data

- The ledger comes from `orchestration_ledger.py export` (schema `orchestrate-ledger-export` v1),
  in orchestrate versions that have the export command. The plugin finds the script in Claude Code's plugin cache, or
  takes the path from the `exportScript` setting.
- Ledgers are read from `~/.claude/projects/*/orchestrate/*.md`; the newest one naming the thread wins.
- The view re-reads the ledger every 20 seconds while it is visible, and at once whenever the
  orchestrator starts or ends a turn or opens a prompt, so questions it writes show up when its turn ends.
- Live state (status, pending approvals, last report, model, effort, context use, last reply) comes
  from bb's thread API. Answers are the owner's latest messages in the orchestrator thread that
  start with `Re «<ask title>»:`.

Runs on the bb server's own machine; it reads local files.

## Develop

```sh
npm install
npm test && npm run typecheck && bb plugin build
bb plugin reload orchestration
```

MIT.

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

Work includes compact counts for owner input, blocked/failed gates, running tasks and recorded
evidence. Evidence counts mean records exist, not that checks passed. Expand dependencies to
inspect their tasks; selecting a dependency resets the filter to All work. Evidence uses the
same source-host validated Markdown/file preview as Brief. Missing evidence and revision are
explicit. This view works without GenUI. See [integration decision](docs/genui-integration.md).
