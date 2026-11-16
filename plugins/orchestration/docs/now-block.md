# The «Now» layer of an orchestration

Status: draft for the owner's confirmation. Sections 1–3 are complete; sections 4 and 5 wait on R1's
report on live activity and are marked where they do.

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
free-text checkpoint and the orchestrator's last status line in the same place.

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
| `liveActivity` | what the orchestrator's or a subtask's running turn is doing now | **pending R1** (section 4) |
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
  (the existing `BUSY` set), shown with the pulsing dot the team rows use, and the live activity
  line from section 4 when there is one; `asking` when `hasPendingInteraction`; `idle since
  <latestAttentionAt>` otherwise; `not in bb's thread list` when the sidebar has no entry (N9).
- **Last turn.** First line of `lastReport` via `firstLine(…, 140)` with the age of
  `latestAttentionAt`. Hidden while the orchestrator runs, because the line belongs to the turn
  before.
- **Doing / Next / Blocked by.** One line each, `firstLine(…, 220)`. `Blocked by` only when not
  null, in the foreground colour with the word «Blocked» (not colour alone).
- **Waits on.** One row per `waitingOn` entry in ledger order, then one per background wait. `who`
  shows as the subtask id, «You» for `owner`, «Background» for a background wait, else as written.
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
  threshold next to `QUIET_MS` in `src/view.ts` (question Q3). A `date`-precision or unparseable
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
  orchestrator: { state: "running" | "asking" | "idle" | "unknown"; age: string; activity: string | null };
  lastTurn: RecapLine | null;
  doing: string | null;
  waits: { who: string; label: string; subtask: string | null; what: string; age: string; kind: "subtask" | "owner" | "background" | "other" }[];
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
  1. live activity of its running turn (section 4, pending R1);
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

**Pending R1** (`R1-live-activity.md`). What the view already reads, from the code:

- bb sidebar per thread: `status`, `latestAttentionAt`, `hasPendingInteraction`, `createdAt`,
  `parentThreadId`, `displayTitle`, `isHidden` (`useOrchestration.ts:95-110`), pushed to the app by
  `experimental_useSidebarThreads`, no polling.
- per subtask, cached 15 s: `threads.get`, `threads.context` (context use), the last
  `client/turn/requested` event (model, effort), `threads.output` (last text)
  (`server.ts:105-128`).

This section will name the source of «what the running turn is doing now» for the orchestrator and
for a subtask, its refresh path within N8, its cost per snapshot, and its failure behaviour.

### 5. Implementation slices

**Pending R1** for I2's live-activity items; the rest is fixed.

#### Shared contract strings

| String | Where | Used by |
|---|---|---|
| `## Current checkpoint` | ledger section heading, unchanged | I1 writes, export reads |
| `- updated:` `- doing:` `- waiting on:` `- next:` `- blocked by:` | ledger keys, lower case, in this order | I1 skill, I1 export |
| `for:` `since:` | fields of a `waiting on:` line, ` \| `-separated | I1 skill, I1 export |
| `owner` | `who` of an owner wait | I1 skill; I2 shows «You» |
| `current_checkpoint.structured`, `.updated`, `.doing`, `.waiting_on[].{raw,who,subtask,what,since}`, `.next`, `.blocked_by` | export JSON | I1 writes, I2 reads |
| `orchestrate-ledger-export`, `schema_version` `1` | export, unchanged | both |
| `REPORT_HEADER` = `^\[orchestrate [^\]]+\]\s+(\S+)\s+(working\|question\|blocked\|delivered\|updated\|rotate):\s*(.*)$` | first line of a subtask report, from `references/protocol.md` line 90 | I2 parses; I1 changes nothing |

#### I1 — kartollika-ai-hub `plugins/orchestrate`

Areas: `skills/orchestrate/SKILL.md` (§3 init, §6 step 4, §7 resume, §8 finish: write the block),
`skills/orchestrate/references/ledger.md` («Schema», «Subtask statuses» note rule, «Old
vocabulary», «Overall state and brief»), `skills/orchestrate-handover/SKILL.md` where it reads
or writes «Current checkpoint» (lines 58, 72, 138, 163 in 0.16.0: a takeover rewrites the block),
`scripts/ledger_export.py`, `scripts/orchestration_ledger.py` (`check` warning),
`docs/ledger-export.md`, `scripts/test_ledger_export.py`, `scripts/test_orchestration_ledger.py`,
`tests/fixtures/ledger-export/`, and the plugin version the repo's release procedure bumps.

Done when:

1. `export` of `tests/fixtures/ledger-export/current.md`, which carries the filled example above,
   prints `structured: true` and the keys and values of section 2's sample; a test asserts it.
2. `export` of `bare.md`, `legacy-ru.md`, `real-shaped.md` and a free-text-checkpoint fixture exits
   0 with `structured: false`, `waiting_on: []`, and `text`, `time`, `background_waits`,
   `archive_after_handover` equal to what 0.16.0 prints for them; a test asserts it.
3. A repeated `doing:` gives the first value and the warning; a `waiting on:` without `for:` or
   `since:` gives `what` = the rest and `since` = `null`; a test each.
4. `check` on a ledger without `doing:` prints the warning and exits 0; with the block, no warning.
5. The skill text and `ledger.md` «Schema» show the block with the key order of the contract table,
   and §6 step 4 says to rewrite it, `updated:` included, in every event update.

#### I2 — bb-plugins `plugins/orchestration`

Areas: `src/contract.ts`, `src/ledger.ts`, `src/view.ts`, `src/Recap.tsx` (or a new
`src/NowBlock.tsx`), `src/Brief.tsx`, `src/OrchestrationTab.tsx`, `server.ts`
(`ledgerModifiedAt`), `test/`, `README.md`, `skills/orchestration/SKILL.md`, `PLUGIN_OVERVIEW.md`
if its text names the recap; `docs/plugins.md` orchestration entry. Not `docs/now-block.md`.

Done when (live-activity items to be added after R1):

1. `node --test` cases in `test/view.test.ts` build `view.now` from: a structured block; a block
   whose `updated` is older than the orchestrator's last turn by more than `STALE_GRACE_MS`
   (stale) and by less (not stale); a free-text checkpoint (`source: "text"`); an export without
   `structured` (`source: "none"`); no sidebar entry (`state: "unknown"`).
2. `node --test` cases in `test/ledger.test.ts` read section 2's sample into `LedgerSummary.now` and
   an old v1 export (no new keys) into `now: null` without a new warning.
3. A `working` row whose last output starts with a `REPORT_HEADER` line shows only the gist; a
   `working — <note>` status cell shows the note.
4. `npm test`, `npm run typecheck`, `bb plugin build` pass in `plugins/orchestration`.
5. After landing, in the running bb: the Right now block is seen on this orchestration's view
   (`thr_yc4bw8qaah`) and on one free-text ledger; else an owner check with the exact steps, marked
   unverified (AGENTS.md «Done means seen working»).

I2 does not wait for I1 to land: its tests use fixtures, and against an installed orchestrate
without the keys it shows the old-exporter fallback.

## What it does not cover

- Any change to how subtasks report; the report header is read as `protocol.md` defines it.
- Editing the ledger from the view; the view stays read-only towards the ledger.
- Notifications: the block informs, it never notifies (the skill's «What reaches the owner» stands).
- The context-card row and the narrow tab beyond the compact form above.
- History of past blocks: each update replaces the block; the decision journal and gates keep the
  history.
- Release of `orchestration` (unpublished, `docs/publication.md`) and the update of the installed
  orchestrate plugin (the owner's, per the ledger's «For the owner»).

## Open questions for the owner

Q1–Q6 are design decisions, which this orchestration's delegation keeps with the owner.

- **Q1. Where the block lives.** A: keyed lines inside «Current checkpoint» (recommended: old
  readers keep working, one section to maintain). B: a new «Now» section.
- **Q2. The block's title in the view.** A: «Right now», with the tab staying «Now» (recommended:
  the tab is about what needs you; the block is about what happens). B: rename the tab
  «Attention» and title the block «Now».
- **Q3. Staleness grace.** 10 minutes (recommended: a turn writes the ledger before it sends its
  messages and ends; 10 minutes covers that without hiding a skipped update for long), 5 minutes,
  or 20 minutes.
- **Q4. Free-text checkpoints of old ledgers.** A: show them clamped to three lines with «Show all»
  and the ledger's age (recommended: no line is guessed to be current). B: show only «This ledger
  has no Now block yet» and keep the text folded.
- **Q5. `check` warning on a ledger without `doing:`.** A: warn, exit 0 (recommended: it nudges the
  migration the way «For the owner» warnings do). B: no warning.
- **Q6. Name of what a subtask resolves.** A: the skill asks for two to eight words after the id in
  the «Subtasks» id cell (recommended: the export already reads it). B: leave names optional; rows
  keep showing the delivery.

Questions from section 4 follow R1's report.
