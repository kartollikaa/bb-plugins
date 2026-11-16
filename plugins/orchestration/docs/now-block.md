# The «Now» layer of an orchestration

Status: complete draft for the owner's confirmation. Section 4 builds on R1's report on live
activity (`R1-live-activity.md`, bb 0.49.0, plugin SDK 0.6.132). Q1 and Q5 were decided by the
orchestrator, Q2–Q4, Q6 and Q7 by the owner (see «Decided»).

Two parts build from this document: **I1** in kartollika-ai-hub (`plugins/orchestrate`: the skill,
the ledger schema, the export) and **I2** in this repo (`plugins/orchestration`: the view). Section 5
lists the strings both share.

## Problem

The owner, verbatim: «I don't see the current state of orchestrator and the work on the task. So
there is no, like, the current state, the current status recap, what the orchestrator is doing right
now, what is running, what the issue is resolving … everything should be pretty observable,
investigatable. So if possible, then the orchestrator should print that information on the
Orchestrate View.»

What fails today, by source:

1. **The view shows no current state.** `src/Recap.tsx:4` renders `view.recap.goal` and the generic
   phase label (`src/phase.ts`, e.g. «Work in progress»). `view.recap.now` and `view.recap.last`
   are computed in `src/view.ts:412` and never rendered.
2. **What exists is folded at the bottom.** `src/Brief.tsx:22-30` puts «Latest orchestrator report»
   and «Current checkpoint» into closed `<details>` at the end of Brief, below the ask cards
   (`src/OrchestrationTab.tsx:475-489`), and only in the «Now» tab.
3. **The ledger has no current-state record to show.** Of 57 ledgers under
   `~/.claude/projects/*/orchestrate/*.md` (counted 2026-11-16), 18 have a «Current checkpoint»
   section at all. Where it is filled, it is mostly an appended log, not a current line:
   `-Users-dmitrijmaksimov-Projects-bb/orchestrate/thread-tree-sidebar-v2.md` holds four «GS11 done…»,
   «GO8 done…», «Lesson…», «GO9 done…» paragraphs (1 KB); `…-star-wars-imperial-assault/orchestrate/ts-redo.md`
   appends «UPDATE 2026-11-13…», «UPDATE 2026-11-14…»; `tracker-core-ordered.md` has 146 lines (85 KB);
   `return-to-hoth.md` puts the current line first and free bullets after it. Neither order nor
   content is predictable, so no reader can pick «the current line» out of it.
4. **The skill asks for it without a shape.** orchestrate 0.16.0 `skills/orchestrate/SKILL.md` §6
   step 4: «replace Current checkpoint with the current action or wait»; `references/ledger.md`
   «Schema» gives one placeholder line `<next action or wait, affected delivery version, evidence
   location>` plus the keyed `- background wait:` and `- archive after handover:` lines.
5. **The export carries only text.** `scripts/ledger_export.py` `checkpoint()` returns
   `{"text", "time", "background_waits", "archive_after_handover"}`; `docs/ledger-export.md` documents
   the same. `src/ledger.ts:113-130` turns it into `LedgerSummary.checkpoint {text, at}`.
6. **A team row's step is weak.** For a `working` subtask, `stepOf` (`src/view.ts:173-201`) shows
   the first line of the agent's last output, which is the report's protocol header
   (`[orchestrate <slug>] <task-id> working: <gist>`), bracket and all; other statuses show a fixed
   phrase or the status cell. What the subtask resolves is the id cell's name, which most ledgers
   leave empty (`ledger.md` «Schema» writes `| T1 |`), so the row falls back to the delivery
   (`src/ledger.ts:86`).
7. **No live activity.** The view knows whether a thread has a turn running (bb sidebar `status`,
   `src/useOrchestration.ts:95-110`), but not what the turn is doing. Section 4 covers what bb exposes.
8. **A wait on the owner can be invisible.** `src/owner.ts:43` (`ASK_PREFIX`) makes an ask only of
   `ask:`, `Q:`, `question:` and `Q (asked …):` lines; every other «For the owner» line is a note
   (`src/owner.ts:69-73`), and `test/owner.test.ts:36-41` asserts it, so `Waiting: owner merge of …`
   is a note. On 2026-11-16 the us26 orchestration waited on the owner with the free-text line
   `- connect Pixel 9a (5C111JEBF10513) via USB/wireless debugging, app signed in on drma-dy → device
   check resumes in thr_bjp39sjv29`: the view showed nothing waiting while the orchestrator waited
   (`…-Projects-work-drinkit-ai-hub/orchestrate/us26-candidate-button-split.md`, since rewritten
   with proper `ask:` lines). The owner: «make sure that it wouldn't happen again, because it has
   already happened twice during the day». The skill has no check at the end of a turn: orchestrate
   0.16.0 `hooks/hooks.json` has only `SessionStart(compact)` and `PostToolUse(*)`, and
   `scripts/orchestration_ledger.py` `owner_warnings` (line 231) reports free text as a warning
   only when `check` or a helper runs.

## Requirements

- **N1** The ledger holds the orchestration's current state in a fixed key format: what the
  orchestrator is doing, each thing it waits on (whom, for what, since when), its next step, what
  blocks the orchestration, and when this was written.
- **N2** The orchestrator rewrites that block in every event's ledger update, so its time moves at
  least once per turn that handles an event.
- **N3** Every existing ledger still exports and displays: free-text and missing checkpoints give a
  defined fallback; no migration is needed to view one.
- **N4** The export change is additive: no existing key changes name, type or meaning; a new view
  reads an old export and an old view reads a new export.
- **N5** The top of the Orchestration view shows, without a click and in every tab: the
  orchestrator's live state with its age, what it is doing, what waits on whom and since when, its
  next step, what blocks it, its last decision, and how old the block is.
- **N6** The view says when the block may be out of date, from a rule a test can check, and never
  shows a block without its age.
- **N7** Each team row shows the subtask's current step in one line from the freshest available
  source, and what the subtask resolves.
- **N8** No refresh beyond today's: the 20 s visible snapshot read and the refetch on the
  orchestrator's turn signal (`src/refresh.ts`, `docs/genui-integration.md` «Refresh is unchanged»),
  unless bb offers an event to subscribe to.
- **N9** Missing live data (thread not in bb's sidebar, another host) degrades to ledger-only with a
  visible note; missing ledger data degrades to live-only.
- **N10** The orchestrate skill stays host-neutral (`docs/genui-integration.md`, «Ownership»): the
  ledger block names no bb concept and works where no view reads it.
- **N11** The block stays small (one line per key, a handful of waits), so it does not press on the
  ledger's state budget (`references/ledger.md`, «Reading and updating»).
- **N12** From the top block the owner can open the thread of a subtask it names, read the checkpoint
  as written and the orchestrator's full last report.
- **N13** I1 and I2 share exact, named contract strings, so each is built and tested alone.
- **N14** The view never shows «nothing waits on you» while the orchestrator waits on the owner: a
  «For the owner» line in any shape other than a note counts as an ask, and an orchestrator that
  asked in the chat without an ask line is flagged.
- **N15** On hosts with turn-end hooks, an orchestrator turn that waits on the owner cannot end
  without an `ask:` line for it; elsewhere the rule text and `check` say so.
- **N16** Live activity costs at most one filtered, cursor-based event read per changed thread, and
  is refreshed by bb's thread events, not a new timer.

## Options

### Where the current state lives in the ledger

| Option | N1 | N3 / N4 | N10 / N11 | Cost |
|---|---|---|---|---|
| **A. Keyed lines inside «Current checkpoint»** (`- doing:`, `- waiting on:` …), next to the existing `- background wait:` | yes | yes: the section name, `text` and the existing keys are unchanged; old exporters still show the lines as text | yes | export parses three more keys; skill text changes in four places |
| B. A new `## Now` section; «Current checkpoint» keeps only the waits | yes | partly: an old exporter ignores the unknown section (`ledger-export.md`: «Sections outside this list … are not exported»), so an old view loses the current state entirely | yes | two sections say overlapping things; one more section in the state budget |
| C. A sidecar `<slug>/now.json` the orchestrator writes | yes, machine-exact | no for old tools; resume and handover read the ledger, not the sidecar | breaks «the ledger is the state» (`ledger.md`), JSON hand-written by an agent | a second state file to keep consistent |
| D. Do nothing in the ledger; derive «now» from the orchestrator's last status line, status cells and the decision journal | no: no «waiting on», «next» or blocker | yes | yes | I2 only |

D is real and is the fallback for old ledgers (section 3), but it cannot say what the orchestrator
waits on or does next: that exists only in its head. **A** wins: the section the skill already
rewrites each step gets a shape, every reader that exists keeps working, and the format follows the
keyed-bullet pattern the export already reads in that section.

### How the export carries it

| Option | N4 | Cost |
|---|---|---|
| **E1. New keys inside `current_checkpoint`, `schema_version` stays 1** | yes: `ledger-export.md` «Compatibility»: «Within a version fields are only added» | I2 must treat a missing key as «old exporter» |
| E2. Top-level `now` object, `schema_version` 2 | a v1 reader warns «Export schema version 2» on every ledger (`src/ledger.ts:62`) | needs a coordinated release of both plugins |

E1: nothing is renamed or retyped, so the rule says no bump.

### Where the view shows it

| Option | N5 | Cost |
|---|---|---|
| **V1. A «Right now» block in the header, between the goal and the tab bar** | yes, in Now, Work and Activity | Recap grows; the tab variant needs a compact form |
| V2. Inside the «Now» tab, above the attention heading | not in Work or Activity | smallest change |
| V3. Replace the attention heading and subline with it | mixes «what needs you» with «what is happening»; the context-card row (`rowLabel`) depends on the heading | rewrites `buildView`'s heading logic |

V1: the owner asked for the state to be what they see first, wherever they are in the view.

## Recommendation

**A + E1 + V1.** The orchestrator writes five keyed lines at the top of «Current checkpoint» in every
event update; the export parses them into new keys of `current_checkpoint` without a version bump;
the view puts a «Right now» block under the goal that joins those lines with bb's live thread state,
dates every line and flags a block older than the orchestrator's last turn. Old ledgers show their
free-text checkpoint and the orchestrator's last status line in the same place. Running turns show
their current step from bb's thread events, read by the plugin's own fold and refreshed by those
events, not a timer (section 4). A wait on the owner gets two guards: the view treats every
«For the owner» line that is not a note as a wait and flags a question asked only in the chat, and
the skill's Stop hook keeps an orchestrator turn from ending on such a wait without an `ask:` line
(section 6).

## Design

### 1. The ledger block (I1)

The block is the head of «Current checkpoint». Every key is one line, lower case, written in this
order; `waiting on:` repeats, once per wait. The existing keys keep their place after it.

```markdown
## Current checkpoint
- updated: <time>
- doing: <the step the orchestration is in, one line: subject first>
- waiting on: <who> | for: <what would move it> | since: <time>
- next: <the orchestrator's next step and what triggers it | none>
- blocked by: <what stops the whole orchestration | none>
- background wait: <what it waits for, on which version; how to start it again | none>
- archive after handover: <session ids; waits on: <the condition still open> | none>
```

Meaning of each key:

| Key | Holds | Rules |
|---|---|---|
| `updated:` | `<time>` in the format of `ledger.md` «Times» | the time of this update; rewritten in every event update even when nothing else changed (N2) |
| `doing:` | what the orchestration is in now | starts with what it is about: `G2 — I2 @ 3f2a1c0: checks running in the gate worktree`, `briefing I1 and I2`, `init: building the profile`. When the orchestrator only waits: `waiting — see «waiting on»`. Never empty. |
| `waiting on:` | one open wait, ` \| `-separated fields like a «For the owner» line | `<who>` is a subtask id, `owner`, or a short name of an outside party (`CI on acme/app#38`, `outside reviewer`). `for:` is what would move it. `since:` is when the wait began, kept across updates. A background command is not repeated here; it stays a `background wait:` line. No line when nothing is waited on. |
| `next:` | the orchestrator's next step and its trigger | `on R1's report: unblock D1 sections 4–5`; `none` when the orchestration is closing |
| `blocked by:` | what stops every next step | `none`, or the cause; when it is not `none` the header `Status` is `blocked` too. A single subtask's block stays in its status cell. |

Rules for the skill text:

- The block replaces the free-text line of the schema. Free text is not added under it; prior
  results go to Brief or history (`ledger.md` «Overall state and brief» already says so).
- An owner wait is also an `ask:` line in «For the owner»; the `waiting on: owner` line names it
  with its ask title so both read the same: `waiting on: owner | for: «Merge the orchestrate plugin
  PR (I1)…» | since: …`.
- The subtask's own current step stays in its «Subtasks» status cell, after the status word
  (`working — drafting sections 1–3`), which `ledger.md` «Subtask statuses» already allows. The
  skill asks to keep that note current from each report's gist.
- The «Subtasks» id cell names what the subtask resolves after the id, two to eight words:
  `| D1 now-block design |`. The export already splits it (`S1 row foundation` → `row
  foundation`); today's schema line `| T1 |` invites leaving it empty.

Filled example, from this orchestration as it stood when this document was drafted:

```markdown
## Current checkpoint
- updated: 2026-11-16T14:32+03:00
- doing: waiting — see «waiting on»; D2 drafting team-roles design
- waiting on: R1 | for: its report on bb live activity (R1-live-activity.md) | since: 2026-11-16T14:04+03:00
- waiting on: D1 | for: now-block.md sections 1–3 draft | since: 2026-11-16T14:04+03:00
- waiting on: owner | for: «Merge the orchestrate plugin PR (I1) yourself, or let me merge it after it passes checks and an independent review» | since: 2026-11-16T14:04+03:00
- next: on R1's report: send «unblocked» to D1 for sections 4–5
- blocked by: none
- background wait: none
- archive after handover: none
```

**Old ledgers.** A «Current checkpoint» without any of the five keys is a free-text checkpoint. It
stays valid and is read as today. The skill's «Old vocabulary» table gains the row «free text under
Current checkpoint → the Now block; prior results to Brief or history», applied on the next update
like the other rows. `check` and every helper mutation add a warning when «Current checkpoint» has
no `doing:` line, and still exit 0, as they do for «For the owner» lines outside the format
(`ledger.md` «Reading and updating»).

### 2. The export (I1)

New keys inside `current_checkpoint`. Existing keys keep their name, type and content: `text` is
still every line except `background wait:` and `archive after handover:`, so the five new lines are
also in `text` and an old view shows them as written. `time` is still the first time in `text`,
which is now `updated:`.

```json
"current_checkpoint": {
  "text": "- updated: 2026-11-16T14:32+03:00\n- doing: waiting — see «waiting on»; …",
  "time": {"at": "2026-11-16T14:32+03:00", "precision": "time", "offset": true},
  "background_waits": [],
  "archive_after_handover": [],
  "structured": true,
  "updated": {"at": "2026-11-16T14:32+03:00", "precision": "time", "offset": true},
  "doing": "waiting — see «waiting on»; D2 drafting team-roles design",
  "waiting_on": [
    {
      "raw": "R1 | for: its report on bb live activity (R1-live-activity.md) | since: 2026-11-16T14:04+03:00",
      "who": "R1",
      "subtask": "R1",
      "what": "its report on bb live activity (R1-live-activity.md)",
      "since": {"at": "2026-11-16T14:04+03:00", "precision": "time", "offset": true}
    },
    {
      "raw": "owner | for: «Merge the orchestrate plugin PR (I1) …» | since: 2026-11-16T14:04+03:00",
      "who": "owner",
      "subtask": null,
      "what": "«Merge the orchestrate plugin PR (I1) …»",
      "since": {"at": "2026-11-16T14:04+03:00", "precision": "time", "offset": true}
    }
  ],
  "next": "on R1's report: send «unblocked» to D1 for sections 4–5",
  "blocked_by": null
}
```

| Key | Type | From |
|---|---|---|
| `structured` | bool | `true` when the section has at least one of `updated:`, `doing:`, `waiting on:`, `next:`, `blocked by:` |
| `updated` | time \| null | `updated:` |
| `doing` | string \| null | `doing:` |
| `waiting_on` | `[{"raw", "who", "subtask", "what", "since"}]` | each `waiting on:` line in file order. `who`: text before the first ` \| `. `subtask`: `who` when it equals a «Subtasks» id, else `null`. `what`: the `for:` field, else the rest of the line. `since`: time of the `since:` field, else the first time in the line, else `null` |
| `next`, `blocked_by` | string \| null | `next:`, `blocked by:`; `none`, `—` and empty are `null` (the export's `NONE_CELLS`) |

Reading rules: keys are matched case-insensitively with the bullet regex `checkpoint()` already
uses for `background wait`; a continuation line joins its bullet, as `bullets()` does. A repeated
single key (`doing:` twice) keeps the first and adds a warning `Current checkpoint: repeated
«doing:»; the first is read`. Field keys inside a `waiting on:` line (`for:`, `since:`) follow
the «For the owner» rule: any case, and a ` | ` segment without a known key stays with the field
before it. On a ledger without the keys: `structured: false`, `updated`, `doing`, `next`,
`blocked_by` are `null`, `waiting_on` is `[]`. A ledger without the section exports the same.

**Schema version.** Stays `1`, by `docs/ledger-export.md` «Compatibility». The rule I1 adds to that
section, so later changes follow it: «A consumer tells an older exporter by a key's absence.
Raising `schema_version` is for renaming, removing or retyping a key, and for changing what an
existing key holds; a new key, or a new key inside an existing object, keeps the version.» I2 tells an old exporter
by `structured` being absent and treats it as `structured: false`.

`docs/ledger-export.md`'s Fields table, its `current_checkpoint` row, and the sample
`tests/fixtures/ledger-export/current.{md,json}` gain the new keys.

### 3. The view (I2)

#### Data the view uses

| Name in this section | Source | Present today? |
|---|---|---|
| `block` | export `current_checkpoint` new keys → `LedgerSummary.now` (new, below) | no: I1 + I2 |
| `checkpointText` | `current_checkpoint.text` → `LedgerSummary.checkpoint.text` | yes |
| `lastDecision` | last «Decision journal» row → `LedgerSummary.lastDecision` | yes, unused |
| `orchestratorLive` | bb sidebar entry of the orchestrator thread: `status`, `latestAttentionAt`, `hasPendingInteraction` (`useOrchestration.ts:95-110`) | yes |
| `lastReport` | `snapshot.report`: the orchestrator thread's last output (`server.ts:178`); its first line is the turn's status line the skill asks for (§6 «What reaches the owner») | yes, folded |
| `ledgerModifiedAt` | the ledger file's mtime, which `exportLedger` already stats (`server.ts:71`) | no: I2 adds it to the snapshot |
| `liveActivity` | what the orchestrator's or a subtask's running turn is doing now: turn start, current step and its start, background work | no: I2 adds the `activity` RPC (section 4) |
| `report gist` | a subtask's last output, first line, matched against the protocol header | the text is there (`Agent.lastOutput`); the parsing is new |

`LedgerSummary` gains:

```ts
now: {
  structured: boolean;
  updated: string | null;          // ISO, from current_checkpoint.updated.at
  doing: string | null;
  waitingOn: { who: string; subtask: string | null; what: string; since: string | null }[];
  next: string | null;
  blockedBy: string | null;
} | null;                          // null: export without `structured` (old exporter)
```

and the snapshot gains `ledgerModifiedAt: number | null`.

#### The top block

Page variant (main area; the chat sits in the rail, `OrchestratorPage.tsx`). Each element is
followed by its source in brackets; the brackets are not shown.

```
Make the bb Orchestration view show what an orchestration is doing right now …     [goal]
┌ Right now ───────────────────────────────────────── updated 6m ago ┐   [block.updated]
│ ● Orchestrator · idle since 3m                                     │   [orchestratorLive]
│   Last turn: D2 working: team-roles design drafted; waking on …    │   [lastReport, first line]
│   Doing     waiting — see below; D2 drafting team-roles design     │   [block.doing]
│   Waits on  R1 · its report on bb live activity           28m  ↗   │   [block.waitingOn + threadIds]
│             You · «Merge the orchestrate plugin PR (I1) …» 28m      │
│             Background · checks on 3f2a1c0                         │   [checkpoint background_waits]
│   Next      on R1's report: send «unblocked» to D1                 │   [block.next]
│   Last decision  Split: R1 research, D1/D2 designs, I1/I2/I3 · 28m │   [lastDecision]
│   ▸ Checkpoint as written   ▸ Full last report                     │   [checkpointText, lastReport]
└────────────────────────────────────────────────────────────────────┘
Work in progress                                                      [phase.label]
[ Now · 2 ] [ Work ] [ Activity ]
```

Rules:

- **Orchestrator line.** `running` while the sidebar status is `starting`, `active` or `stopping`
  (the existing `BUSY` set), shown with the pulsing dot the team rows use, followed by section 4's
  activity when there is one: `● Orchestrator · running 4m · Running npm test · 40s` (turn age from
  `activity.turnStartedAt`, step and its age from `activity.step` and `activity.stepStartedAt`);
  `asking` when `hasPendingInteraction`; `idle since <latestAttentionAt>` otherwise; `not in bb's
  thread list` when the sidebar has no entry (N9).
- **Last turn.** First line of `lastReport` via `firstLine(…, 140)` with the age of
  `latestAttentionAt`. Hidden while the orchestrator runs, because the line belongs to the turn
  before.
- **Doing / Next / Blocked by.** One line each, `firstLine(…, 220)`. `Blocked by` only when not
  null, in the foreground colour with the word «Blocked» (not colour alone).
- **Waits on.** One row per `waitingOn` entry in ledger order, then one «You» row per open owner ask
  (section 6) that no `waiting on: owner` line already names, then one per background wait, then
  one `Background · <n> commands running` row when section 4's live count exceeds the ledger's
  background waits. `who` shows as the subtask id, «You» for `owner`, «Background» for a background
  wait, else as written.
  The age is from `since`. A row whose `subtask` has a thread in `view.threadIds` is a button that
  opens it (`actions.openThread`, as the team rows do) (N12). At most five rows; more fold under
  «N more».
- **Last decision.** `view.recap.last`, already computed.
- **Folds.** «Checkpoint as written» renders `checkpointText` with `EvidenceMarkdown`, as Brief
  does today; «Full last report» renders the report as Brief does today. Both leave Brief
  (`Brief.tsx:22-30` is removed), so there is one place for them.
- **Age and staleness (N6).** The header shows `updated <age> ago` from `block.updated`. The block is
  *possibly out of date* when the orchestrator is not running and `latestAttentionAt >
  updated + STALE_GRACE_MS`, i.e. a turn ended well after the last update, though the skill rewrites
  the block in every event update. Then the header reads `updated 2h ago · written before the
  orchestrator's last turn` and the block's text is muted. `STALE_GRACE_MS` is 10 minutes, an owner
  threshold next to `QUIET_MS` in `src/view.ts` (Q3, decided). A `date`-precision or unparseable
  `updated` shows the date and is never marked stale. `updated` missing on a structured block: the age
  comes from `ledgerModifiedAt` with the words `ledger written <age> ago`.

**Fallbacks (N3, N9).**

| Ledger | Live | The block shows |
|---|---|---|
| structured | present | everything above |
| structured | missing | everything but the orchestrator line, which reads `not in bb's thread list` |
| free-text checkpoint | any | orchestrator line and last turn; then `checkpointText` as Markdown, clamped to three lines with «Show all», titled `Checkpoint (free text) · ledger written <age> ago` from `ledgerModifiedAt`; last decision. No line is guessed to be current: the survey above shows logs appended at either end. |
| no checkpoint, or an old exporter | any | orchestrator line, last turn, last decision, and one muted line: `This ledger has no Now block yet. Orchestrators write one from the orchestrate version that ships it.` |
| none, and no live entry | — | the header keeps only the goal and the phase, as today |

**Tab variant** (the narrow Orchestration tab, `variant="tab"`): the orchestrator line, `Doing`, and
`Waits on` as one line `Waits on R1, you and 1 background · 28m`. The rest shows on the page.

`view.recap.now` is replaced by `view.now`, a `NowView` that `buildView` computes, so the rules above
are tested in `test/view.test.ts` without rendering:

```ts
export interface NowView {
  source: "block" | "text" | "none";
  orchestrator: { state: "running" | "asking" | "idle" | "unknown"; age: string; activity: string | null; background: number };
  lastTurn: RecapLine | null;
  doing: string | null;
  waits: { who: string; label: string; subtask: string | null; what: string; age: string; kind: "subtask" | "owner" | "background" | "other" }[];
  mismatch: boolean;               // section 6: asked in the chat, no ask line
  next: string | null;
  blockedBy: string | null;
  lastDecision: RecapLine | null;
  updated: { age: string; stale: boolean; from: "block" | "ledger" | null };
  text: string | null;
}
```

#### The team row

```
● D1  now-block design                                          4m   [label, name; age = lastReport]
      Drafting sections 1–3 of now-block.md                          [step, below]
  ▾ Status     working — drafting sections 1–3                       [statusRaw]
    Last report  D1 working: sections 1–3 drafted · 4m               [report gist]
    Runs       Opus 5.5 · high                                       [existing]
    Context    41%                                                   [existing]
    Gate       Not at a gate yet                                     [existing]
    [Open thread]
```

- **Name** (what it resolves): the id cell's name, else the delivery, as today
  (`src/ledger.ts:86`). I1's skill rule fills the name in new ledgers.
- **Step**, first that applies, after the existing pending, stuck and child cases of `stepOf`, which
  stay as they are:
  1. while its turn runs: the live step with its age (`Running npm test · 40s`), else `Turn
     running 4m` (section 4);
  2. for `working`, `briefed` and `blocked`: the status note after the status word when the
     ledger has one (`statusNote`, already in `view.ts`);
  3. for `working`: the report gist, the `<gist>` of a last-output first line matching
     `REPORT_HEADER` (section 5), so the bracketed header no longer shows; otherwise `firstLine` of
     the output as today;
  4. the existing phrases.
- **Expanded** gains `Status` (the full status cell) and `Last report` (header kind and gist with
  its age) above the existing `Runs`, `Context`, `Gate`.

#### What stays as it is

The attention heading, subline, ask and answered cards, the context-card row label, Team grouping,
History, the Work and Activity tabs, refresh timers, navigation and reply handling. Brief keeps its
Markdown result and the completed and remaining lists; it loses the two folds that move into the
block.

### 4. Live activity

Sources, from R1 (`R1-live-activity.md`, findings 1a–5) and the code that reads them today:

| What | Source | Cost per refresh |
|---|---|---|
| a turn is running; it asks | bb sidebar `status`, `hasPendingInteraction`, already read (`useOrchestration.ts:95-110`) | none: pushed to the app |
| what it asks | `threads.interactions.list` through the existing `pending` RPC (`server.ts:220`) | unchanged |
| turn start | the latest `turn/started` with no top-level `turn/completed` after it (R1 1b) | the fold below |
| current step and its start | an `item/started` whose `item.id` has no `item/completed` yet; label from `stepText` (R1 2a–2c): the command's first words, `presentation.label.pending`, or the tool name; `presentation.suppress` items are skipped | the fold below |
| background work, count | sidebar `activity.backgroundCommands` and `activity.backgroundAgents` (R1 3a, 3b) | none: pushed |
| background work, what | `item/backgroundTask/progress` and `…/completed` events: `description` of each task with no `completed` yet (R1 3a, S3) | the fold below |

An idle thread can still run background work (R1 S3), so «is anything running» reads the sidebar
counts, not `status` alone. Provider subagents are counted, not listed: R1 saw a count of one active
agent while thread-tree's `subagents` fold listed none running, so a list would contradict the count.

**The fold (I2, `src/activity.ts`).** A pure fold over one thread's typed events, kept per thread on
the server:

```ts
export const ACTIVITY_EVENT_TYPES = ["turn/started", "turn/completed", "item/started", "item/completed",
  "item/backgroundTask/progress", "item/backgroundTask/completed"] as const;

export interface ThreadActivity {
  turnStartedAt: number | null;    // epoch ms; null when no turn runs
  step: string | null;             // «Running npm test», «Loading skill», «Thinking»
  stepStartedAt: number | null;    // createdAt of that item/started
  background: { description: string; startedAt: number }[];
}
```

I2 copies `foldSignalEvents`, `stepText`, `commandGist` and the paging of `createSignalReader` from
`plugins/thread-tree/src/threadSignals.ts` (first read: newest-first pages of 100 typed rows;
then `order: "asc", afterSeq: lastSeq`; 4 reads at a time; at most 400 threads cached), with the
nested-turn rule (`isTopLevelCompletion`) and their tests, trims them to `ThreadActivity`, and adds
`stepStartedAt` and the background list, which thread-tree does not return (R1 2b).

Copy, not a call to thread-tree's `threadSignals` RPC: AGENTS.md «Plugins stay independent» bars
imports, and a runtime call makes live activity disappear without a trace when thread-tree is off
or changes its output; its output also lacks the step's start and the background detail, so using
it would need a thread-tree change for an orchestration feature. The cost is about a hundred
duplicated lines, the kind of duplication AGENTS.md already accepts for vendored UI.

**Contract and refresh (N8, N16).** A batched, keyed RPC in `src/contract.ts`, shaped like
thread-tree's `threadSignals` (`plugins/thread-tree/server.ts:78-83`):

```ts
activity: {
  input: z.object({ keys: z.array(z.string().min(1)).min(1).max(50) }),
  output: z.record(z.string(), threadActivitySchema.nullable()),
  keyTags: (key: string) => [`activity:${key}`],
},
```

- The app asks for the orchestrator and every subtask thread whose sidebar `status` is in `BUSY` or
  whose sidebar background count is above zero. Idle threads are not read.
- The server subscribes, once, to `experimental_thread.events`, `thread.active`, `thread.idle` and
  `thread.failed` (R1 4); for a thread already in its fold map it schedules one
  `bb.rpc.experimental_invalidate([`activity:<threadId>`])` per `ACTIVITY_REFRESH_MS` = 2 s, as
  thread-tree does with `SIGNAL_REFRESH_MS` (`thread-tree/server.ts:39, 204-214`). bb already
  coalesces `experimental_thread.events` to one per second per thread.
- The query has no interval. The 20 s snapshot and the orchestrator turn signal stay as they are;
  ages tick with the view's existing clock (`useNow`). `docs/genui-integration.md` «Refresh is
  unchanged» stays true for the snapshot; I2 adds one sentence there that live steps follow bb's
  thread events.

Cost: an invalidated running thread costs one `events.list` with `types` and `afterSeq`, which
returns only the new step rows (R1 5: unfiltered logs run to 611 KB per 400 events; the typed,
cursor-based read returns `[]` when nothing changed). With ten running threads that is at most five
small reads a second; with all idle, none.

**Failure behaviour.**

| Case | Result |
|---|---|
| `events.list` fails for a thread | that key returns `null`; the row and the orchestrator line show the sidebar state without a step (`running`, `Turn running` without an age), and the ledger step as before; one `bb.log.warn` per thread per failure streak |
| plugin reloaded | the fold map is empty; the first query rebuilds it from the newest-first pages |
| thread not in the sidebar | not asked for; ledger-only, with the note of section 3 (N9) |
| a step stays open after its turn ended | `turn/completed` clears open steps, as in thread-tree's fold |
| a newer bb renames an event type | the fold sees no rows: no step, no error; the sidebar state still shows |

**Privacy.** The step embeds the first words of a running command (`commandGist`, R1 S2). It is shown
only in the owner's own view, as thread-tree's tooltip already does, and is never written to the
ledger, the export or a message.

### 5. Implementation slices

#### Shared contract strings

| String | Where | Used by |
|---|---|---|
| `## Current checkpoint` | ledger section heading, unchanged | I1 writes, export reads |
| `- updated:` `- doing:` `- waiting on:` `- next:` `- blocked by:` | ledger keys, lower case, in this order | I1 skill, I1 export |
| `for:` `since:` | fields of a `waiting on:` line, ` \| `-separated | I1 skill, I1 export |
| `owner` | `who` of an owner wait | I1 skill; I2 shows «You» |
| `- ask:` `- note:` | the only two «For the owner» line forms, unchanged | I1 skill, `check`, Stop hook; I2 parses |
| `Waiting on you: ` / `Nothing waits on you.` (Russian ledgers: `Ждёт тебя: ` / `Ничего не ждёт.`) | the last line of an orchestrator turn's message | I1 skill and Stop hook; I2 mismatch rule |
| `current_checkpoint.structured`, `.updated`, `.doing`, `.waiting_on[].{raw,who,subtask,what,since}`, `.next`, `.blocked_by` | export JSON | I1 writes, I2 reads |
| `orchestrate-ledger-export`, `schema_version` `1` | export, unchanged | both |
| `REPORT_HEADER` = `^\[orchestrate [^\]]+\]\s+(\S+)\s+(working\|question\|blocked\|delivered\|updated\|rotate):\s*(.*)$` | first line of a subtask report, from `references/protocol.md` line 90 | I2 parses; I1 changes nothing |

`ACTIVITY_EVENT_TYPES`, the `activity` RPC and its `activity:<threadId>` tag are I2's alone.

#### I1 — kartollika-ai-hub `plugins/orchestrate`

Areas: `skills/orchestrate/SKILL.md` (§3 init, §6 step 4 and «What reaches the owner», §7 resume,
§8 finish: write the block; section 6's rule), `skills/orchestrate/references/ledger.md` («Schema»,
«Subtask statuses» note rule, «Old vocabulary», «Overall state and brief», «For the owner»),
`skills/orchestrate-handover/SKILL.md` where it reads or writes «Current checkpoint» (lines 58, 72,
138, 163 in 0.16.0: a takeover rewrites the block), `hooks/hooks.json` (a `Stop` entry),
`scripts/owner-wait-stop.py` (new), `scripts/ledger_export.py`, `scripts/orchestration_ledger.py`
(`check` warning and `errors`), `docs/ledger-export.md`, `scripts/test_ledger_export.py`,
`scripts/test_orchestration_ledger.py`, a test for the hook, `tests/fixtures/ledger-export/`,
`tests/fixtures/owner-wait/`, and the plugin version the repo's release procedure bumps.

Done when:

1. `export` of `tests/fixtures/ledger-export/current.md`, which carries section 1's filled example,
   prints `structured: true` and section 2's sample; `bare.md`, `legacy-ru.md`, `real-shaped.md` and
   a free-text-checkpoint fixture export with `structured: false`, `waiting_on: []`, and `text`,
   `time`, `background_waits`, `archive_after_handover` equal to 0.16.0's output. Tests assert both.
2. A repeated `doing:` gives the first value and the warning; a `waiting on:` without `for:` or
   `since:` gives `what` = the rest and `since: null`; `check` warns on a ledger without `doing:`
   and exits 0. A test each.
3. `check` on `tests/fixtures/owner-wait/us26-free-text.md` lists the free-text owner line and, on a
   ledger with `waiting on: owner` and no `ask:`, that wait, under `errors` in its JSON, and exits
   0; on the fixed ledger `errors` is empty. Tests assert it.
4. `owner-wait-stop.py`, tested with fixtures: the us26 ledger plus a transcript whose last message
   ends in a ```` ```ui ```` fence with `Buttons` → prints `{"decision": "block", …}` naming the
   ledger line; the same input with `stop_hook_active: true` → no output; the fixed ledger → no
   output; a transcript that never loaded the orchestrate skill → no output, exit 0.
5. The skill text and `ledger.md` «Schema» show the block in the contract's key order; §6 step 4
   says to rewrite it, `updated:` included, in every event update; «What reaches the owner» carries
   section 6's rule and closing line.

#### I2 — bb-plugins `plugins/orchestration`

Areas: `src/contract.ts`, `src/ledger.ts`, `src/owner.ts`, `src/view.ts`, `src/activity.ts` (new),
`src/useOrchestration.ts`, `src/Recap.tsx` (or a new `src/NowBlock.tsx`), `src/Brief.tsx`,
`src/OrchestrationTab.tsx`, `server.ts` (`ledgerModifiedAt`, the `activity` RPC and its event
subscription), `test/`, `docs/genui-integration.md` (the one refresh sentence), `README.md`,
`skills/orchestration/SKILL.md`, `PLUGIN_OVERVIEW.md` if its text names the recap;
`docs/plugins.md` orchestration entry. Not `docs/now-block.md`.

Done when:

1. `node --test` cases in `test/view.test.ts` build `view.now` from: a structured block; a block
   older than the orchestrator's last turn by more than `STALE_GRACE_MS` (stale) and by less (not
   stale); a free-text checkpoint (`source: "text"`); an export without `structured` (`source:
   "none"`); no sidebar entry (`state: "unknown"`); a running orchestrator with an activity
   (`activity` = step and age) and with `null` activity (no step, no error).
2. `test/ledger.test.ts` reads section 2's sample into `LedgerSummary.now` and an old v1 export into
   `now: null` without a new warning. `test/owner.test.ts`: the us26 line
   `connect Pixel 9a (5C111JEBF10513) via USB/wireless debugging, app signed in on drma-dy → device
   check resumes in thr_bjp39sjv29` is an ask with `format: "free text"` and puts the orchestration in
   `needs`; `Waiting: owner merge of kartollikaa/bb-plugins#12` and `Nothing lands until you approve
   the DB migration` become asks (lines 39–40 change); `note: …`, `answered …`, `Q (answered …): …`,
   `Nothing waiting …` and `Nothing waits on owner input.` stay notes; a view case with notes only, an
   idle orchestrator and a last report ending `Waiting on you: connect the Pixel` gives
   `now.mismatch: true`, and the same report while the orchestrator runs, or ending `Nothing waits on
   you.`, gives `false`.
3. `test/activity.test.ts`: an open `item/started` gives the step and `stepStartedAt`; its
   `item/completed` clears it; `turn/completed` clears open steps; a nested turn's completion does
   not end the outer turn; a background `progress` without `completed` is listed; a second read asks
   with `afterSeq` = the last seq. A server test: an `experimental_thread.events` event for a thread
   in the fold map invalidates `activity:<id>` once within 2 s; for another thread, nothing.
4. A `working` row whose last output starts with a `REPORT_HEADER` line shows only the gist; a
   `working — <note>` status cell shows the note; a running subtask with an activity shows its step
   and age. `npm test`, `npm run typecheck` and `bb plugin build` pass in `plugins/orchestration`.
5. After landing, in the running bb: the Right now block on this orchestration's view
   (`thr_yc4bw8qaah`) shows a running step while the orchestrator works, and one free-text ledger
   shows its fallback; else an owner check with the exact steps, marked unverified (AGENTS.md «Done
   means seen working»).

I2 does not wait for I1 to land: its tests use fixtures, and against an installed orchestrate
without the keys it shows the old-exporter fallback. Section 6's view rules work on today's ledgers.

### 6. A wait on the owner is never invisible

The us26 incident (Problem 8) had two failures: the skill let a turn end waiting on the owner with
no `ask:` line, and the view read the free-text line as a note. Each side gets its own guard, so
either catches the miss alone (N14, N15).

#### a) The view reads every non-note line as a wait (I2)

`parseOwnerItem` (`src/owner.ts:70`) classifies a «For the owner» line by the first rule that
matches:

| # | Line | Result |
|---|---|---|
| 1 | starts with `note:` | note, as today |
| 2 | starts with `answered` or `Q (answered …):` | note: a record of an answer |
| 3 | starts with `ask (draft):` | note: not yet asked |
| 4 | starts with `Nothing waiting`, `Nothing waits`, `Nothing for the owner`, `Quiet:` or `Ничего не ждёт` (case-insensitive) | note: says nothing waits |
| 5 | matches `ASK_PREFIX` | ask with `format: "ask"`, parsed as today |
| 6 | anything else | ask with `format: "free text"`; the title is the line as written |

`OwnerItem`'s ask variant gains `format: "ask" | "free text"`. A free-text ask renders as an ask
card with a muted chip «written as free text», counts towards «needs you» and the tab count, gets
a «You» row in Waits on, and is answered like any ask. This reverses the rule of
`test/owner.test.ts:36-41` (from the README's «The dialog keep showing even when i answered»):
answer records stay notes by rules 2 and 4; lines that state a wait (lines 39–40) become asks.
The orchestrator decided it in the handover of D1 #2, on the owner's «make sure that it wouldn't
happen again».

**Mismatch.** `view.now.mismatch` is true when all of these hold:

- the orchestrator is not running (`BUSY`) and not asking (`hasPendingInteraction`, which already
  shows as a thread ask): an owner's reply would start a turn, so idle means unanswered;
- no open ask of either format;
- and one of: the last non-empty line of `lastReport` starts with `Waiting on you:` or `Ждёт
  тебя:`; `lastReport` holds a ```` ```ui ```` fence whose body names `Form`, `Button`, `Buttons` or
  `Select` (`docs/genui-integration.md` names `Form`; I2 checks the others against the installed
  GenUI catalog); the block has a `waiting on: owner` line.

Then the Now tab's attention list opens with a needs-you card «The orchestrator asked you in its
last message, but its ledger records no ask», with «Full last report» and «Open chat», and Waits on
gets a «You · asked in the chat» row. `snapshot.report` is the orchestrator's last output
(`server.ts:178`), so no new read is needed.

#### b) The skill cannot end such a turn silently (I1)

Rule text for SKILL.md §6 «What reaches the owner» and `ledger.md` «For the owner»:

> Every wait on the owner is an `ask:` line. Before a turn ends waiting on the owner — a question, a
> step only they can run (connect a device, sign in, approve), a choice offered in the chat — each
> item is an `ask:` line in «For the owner» and a `waiting on: owner` line in Current checkpoint,
> both written in this turn. Chat text, buttons, forms and the host's question tools show the
> question; they never replace the line. A «For the owner» line that is neither `ask:` nor `note:`
> is an error: rewrite it before the turn ends. The turn's message ends with `Waiting on you:
> <ask titles, «; »-separated>` or `Nothing waits on you.`

`check`: its JSON gains `errors` (a list of strings) for free-text owner lines and for a `waiting
on: owner` line no `ask:` matches; it still exits 0, so every helper mutation keeps its «warnings,
exit 0» contract (`orchestration_ledger.py`; exit 1 stays «unreadable»).

**Stop hook.** `hooks/hooks.json` gains `"Stop": [{"hooks": [{"type": "command", "command":
"command -v python3 >/dev/null 2>&1 || exit 0; python3 \"${CLAUDE_PLUGIN_ROOT}/scripts/owner-wait-stop.py\""}]}]`.
The script:

1. reads the hook input; exits 0 with no output when `stop_hook_active` is true, so it blocks a
   turn at most once;
2. finds the session's ledger with `scan()` from `compact-reminder.py` (skill invocation and the
   ledgers this session wrote); none → exit 0, so non-orchestrator sessions pay one transcript scan;
3. blocks when the ledger has a free-text «For the owner» line, or a `waiting on: owner` line
   without a matching `ask:`, or the transcript's last assistant message ends with `Waiting on you:`
   or holds an interactive ```` ```ui ```` fence while the ledger has no open `ask:`. It prints
   `{"decision": "block", "reason": "<ledger path>: <each offending line or message>; write each wait
   on the owner as an `ask:` line, then end the turn"}`;
4. any read or parse error → exit 0, no output: the hook never traps a session.

Rejected: a `PostToolUse` check (runs on every tool call and cannot tell the turn's end); making
`check` fail (breaks the exit-0 contract the helpers rely on); the view rule alone (it reveals the
miss but leaves the ledger wrong for resume and handover). Hosts without Stop hooks (Codex) get the
rule text and `check`; the view rule covers them.

#### c) The incident as a test case

`tests/fixtures/owner-wait/us26-free-text.md` (I1) is a minimal ledger whose «For the owner» holds
only `- connect Pixel 9a (5C111JEBF10513) via USB/wireless debugging, app signed in on drma-dy →
device check resumes in thr_bjp39sjv29`, rebuilt from that line because the real ledger has since
been fixed. I2's `test/owner.test.ts` uses the same line. Both suites run it as the incident's
regression case (I1 Done when 3–4, I2 Done when 2).

## What it does not cover

- Any change to how subtasks report; the report header is read as `protocol.md` defines it.
- Editing the ledger from the view; the view stays read-only towards the ledger.
- Notifications: the block informs, it never notifies (the skill's «What reaches the owner» stands).
- The context-card row and the narrow tab beyond the compact form above.
- History of past blocks: each update replaces the block; the decision journal and gates keep the
  history.
- A list of running provider subagents: counted only, until R1's count/fold mismatch is explained
  with a truly running Agent call.
- Turn-end enforcement on hosts without Stop hooks; there the rule text, `check` and the view rule
  apply.
- Release of `orchestration` (unpublished, `docs/publication.md`) and the update of the installed
  orchestrate plugin (the owner's, per the ledger's «For the owner»).

## Decided

- **Q1** (where the block lives) → A, keyed lines inside «Current checkpoint», and **Q5** (`check` on
  a ledger without `doing:`) → A, warn and exit 0: decided by the orchestrator (message #8), as
  implementation choices without product-visible effect; recorded in the orchestration's decision
  journal.
- **Free-text «For the owner» lines are waits** (section 6 a): decided by the orchestrator in the
  handover of D1 #2, on the owner's request that the us26 miss not happen again.
- **Live activity is computed by I2's own fold**, not thread-tree's RPC (section 4): follows
  AGENTS.md «Plugins stay independent».

Decided by the owner on 2026-11-16, in the orchestrator thread (message #18), each the recommended
option; the owner's words follow each one:

- **Q2. The block's title** → A: the block is titled «Right now» and the tab stays «Now». «Right
  now» block, tab stays «Now».
- **Q3. Staleness grace** → `STALE_GRACE_MS` = 10 minutes (section 3, «Age and staleness»). «10 min
  after its last turn».
- **Q4. Free-text checkpoints of old ledgers** → A: the text clamped to three lines with «Show all»
  and the ledger's age (section 3, «Fallbacks»). «Old text, 3 lines with Show all and its age».
- **Q6. Name of what a subtask resolves** → A: the skill asks for two to eight words after the id
  in the «Subtasks» id cell, and every row shows it (section 1, «Rules for the skill text»).
  «Always a short name».
- **Q7. The Stop hook on an orchestrator turn that waits on the owner without an `ask:` line** → A:
  block the turn once with the reason, never while `stop_hook_active` (section 6 b, «Stop hook»).
  Decided by the owner on 2026-11-16 (message #21): «Stop the turn once». Rejected: no hook, and
  blocking on every stop.

## Open questions for the owner

None.
