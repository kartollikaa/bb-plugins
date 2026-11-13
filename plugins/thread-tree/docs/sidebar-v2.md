# Sidebar v2: design spec

The agreed direction for Thread Tree's next redesign. It records what the sidebar must solve, what
was picked and why, what was rejected, and the order to build it in. The interactive prototype is
[sidebar-v2-prototype.html](sidebar-v2-prototype.html): open it in a browser, switch **Now** and
**Vision v2**, and use the menus to compare options (★ marks the pick). It uses invented data.

The pick for each option was reviewed by an independent design review and accepted by the owner.
Where the owner chose against the first proposal, the decision says so.

## What the sidebar must solve

Someone running several Claude Code and Codex threads in parallel asks, in this order:

1. **What needs me now?** Questions waiting for an answer, failed turns, finished results to read,
   PRs to act on, failed automations. Today these are spread over the status line, the GitHub
   section and dots deep in the tree.
2. **What are my agents doing?** Which threads run, for how long, and how far an orchestration
   has got.
3. **Where is my work?** Threads by project, orchestrators with their subthreads, without the list
   filling with finished threads.

Also in scope: telling Claude and Codex threads apart, branch and worktree clarity, and calm rows
that don't move or change height while agents work.

## Principles

- **The queue carries words and actions; rows carry glyphs.** Needs you explains why and offers
  the action. A tree row shows only small markers. One thread never gets two rich rows.
- **Tree rows are one line and a fixed height.** No step text, questions or PR line in the tree,
  so rows don't jump when a turn starts or ends.
- **Nothing moves under the cursor.** Hover actions overlay the row instead of reflowing it.
- **The top of the sidebar is no taller than today.** New things go into the status line or
  under Threads.
- **Quiet when fine.** Healthy sections collapse to a summary header; idle threads get only a faint dot.
- **Use bb's own pieces** (status glyph, drafts, row statuses, provider icon, thread actions) so
  the list matches bb and keeps other plugins' contributions.

## Decisions

### Top of the sidebar: status line as filters

- The overview line ("1 need input · 1 failed · 2 running") becomes four counts: need input,
  failed, running, finished but unread. Each count is a toggle filter that shows a flat list of
  those threads. The Running filter is the one place that shows each thread's current step and a
  live timer.
- `/` (and a search icon in the line) opens an inline filter matching title, branch, PR number and
  project. Escape clears it.
- Rejected: a permanent search box plus filter chips, and a separate Running section. Together
  they made the top taller than today, and Running repeated tree rows.

### Needs you

One queue above the other sections, hidden when empty. ⇧⌘I ("inbox") opens the next item; ⌘J is
bb's side chat (`panel.toggle`) and is not available.

- **Items, in order:** threads asking a question (with the question and how long they waited,
  longest first); failed turns; failed queued messages; running threads silent for 10 minutes
  (a setting) while no background agent, command or workflow of theirs is active; finished threads not yet read ("review the result"); PRs of the user's own threads that
  need action; failed automations.
- A subthread's item names its orchestration ("under Orchestrate PR review…").
- **Row click opens the thread.** Buttons only for actions that aren't navigation: Retry, Resend,
  Stop, Merge (with confirmation). Hover shows snooze ("until it changes") and, for results,
  Mark read.
- **PRs in the queue:** by default only PRs linked to the user's threads, and only when an agent
  can act on them: checks failing, conflicts, changes requested. Ready to merge stays a row icon,
  not a queue item. A setting switches to all GitHub Folder items or none. The owner doesn't act
  on PRs much, so they must not dominate.
- Items are two lines (title, then reason). This is the only two-line list besides the Running
  filter.

### Thread rows

Left to right, fixed 32px height:

`status glyph · title · Retry/Resend · PR icon · shared-branch warning · subagent counter · provider · age`

- **Status glyph:** bb's `experimental_ThreadStatusGlyph`, fed with the thread's indicator, its
  draft state and any row status another plugin set. Spinner while working, attention dot for
  input, error dot, a dot for finished-unread, pencil for an unsent draft, and a small dim dot when idle.
  Fixes today's bug where queued-failed, plan-mode, goal and queued-waiting threads show green.
  Idle: a 4px solid dot in the glyph's centre, in the faintest text colour. Owner, on a blank slot:
  "it feels really awkward because there is an empty space between the title". The dot keeps the
  title column aligned and turns into a state by changing colour only. Rejected: a blank slot (reads
  as a hole), collapsing the slot for idle rows (titles jump sideways when state changes and
  siblings misalign), a hollow ring (noise across dozens of rows).
- **PR:** a tinted 14px icon only when a PR needs action (checks failing, conflicts, changes
  requested, ready to merge); the number and title are in its tooltip, click opens GitHub.
  Nothing otherwise. A failed thread shows Retry and no PR icon. Owner: the PR line "feels like
  too much information … I see the pull request, but I don't use it." Rejected: today's
  scrolling second line, a one-word pill (costs about 40% of the title at 300px), and a PR icon
  revealed on hover (invisible on touch and to keyboard users, and it competes with the hover
  actions).
- **Provider:** always shown, in a fixed slot right before the age, at full contrast, with a
  per-provider brand tint (setting: tint or monochrome). Owner: "there should be an icon of LLM
  provider … since I use Claude and Codex simultaneously." The plugin maps provider id to tint
  itself; bb draws provider logos as single-colour masks. Alternative kept in the prototype: the
  provider logo as the status glyph with a status badge in its corner.
- **Subagent counter** stays as it is today.
- **Shared-branch warning:** a ⚠ when another live thread uses the same branch or worktree
  (`environment.branchName`); the tooltip names the other thread.
- **Tooltip:** title, branch, provider, "updated 5h ago".
- **Age** stays visible at rest.

### Hover actions

- Archive and ⋯ overlay the right end of the row over a fade of the row's background; nothing
  underneath moves. They appear at once on hover and on keyboard focus, with a fade-in of 80ms at
  most. ⋯ is always outermost. The Automations section already uses this overlay; thread rows join
  it. The first pick was a 120ms hover delay; the owner dropped it after trying it: "There is an
  uncomfortable delay between I hover the chat and they appear." Every hover control in the
  sidebar (thread rows, Automations, section headers) shows without a wait.
- Stop lives on the spinner: hovering a running thread's glyph turns it into a Stop button. It is
  never on the spot where Archive sits, so a habitual archive click can't stop an agent.
- Hit targets are 24px. Touch keeps long-press for the menu; compact viewports get taller rows.
- Rejected: today's swap, where the age shrinks and the buttons slide in, shifting the icons and
  re-truncating the title.

### Orchestrations

Owner's design, replacing the first proposal to move orchestrators out of their folders:
"if I put orchestrations into the single thing, I would lose the context on the folder … in
orchestration section there are only [threads] of orchestration without nested [subthreads] …
and in folder there are gonna be the whole … with nested tree."

- **Project folders stay the home.** An orchestrator keeps its full nested tree in its folder.
- **An Orchestrations section** under the Threads heading lists one shortcut row per orchestrator
  that still has work going (anything running, needing input, failed, or finished-unread in its
  subtree). No subthreads in the section.
- **Shortcut row:** most urgent state of the subtree as the glyph, title, provider, age; second
  line with the projects it spans and progress ("bb-plugins · 2/4 done · 1 needs you").
- Click opens the orchestrator and highlights its tree in the folder, unfolding as needed.
- Finished orchestrations leave the section by themselves; archiving happens in the folder. The
  section hides when empty.
- An orchestrator is any thread with unarchived subthreads, detected automatically.

### Orchestrator progress

- No progress bar on the parent row (owner: not enough room).
- Expanded, the subthreads are the progress. Folded, the parent's glyph rolls up the most urgent
  state in its subtree, subthreads that need input or are open still peek out (as today), and the
  fold line counts the subtree by state. A small segmented bar joins the fold line only from five
  subthreads up. A finished folded orchestrator's fold line offers Archive.
- Rejected: a bar on the row, a ring around the status glyph, progress in a subtitle.

### Pull requests and Automations sections

- Both start collapsed, with a summary in the header ("1 failing · 1 conflicts · 5",
  "1 failed · next in 12m").
- Expanded PR rows: the reason as a tinted icon in the glyph slot, title, repo; number and reason
  in the tooltip. A PR linked to a thread offers "open its thread". Snooze stays.
- Paused automations stay behind "N paused", as today.

### Older threads

- Per folder, idle threads that are read, have no draft or pending interaction, aren't pinned,
  whose subtree is quiet, and whose PRs are merged, closed or absent, and that are older than a
  day, fold into one line "N older". The full rule is the line's tooltip.
- Expanding shows them and an "Archive these" button; archiving keeps the existing ⌘Z undo.
- bb's archive can remove a thread's worktree, uncommitted changes included. "Archive these"
  goes through bb's own archive and its confirmation, skips threads whose worktree has
  uncommitted changes (they stay listed with a marker), and says how many it skipped.

### Recent Activity

Hidden by default in v2: the status-line filters and Needs you cover what it was used for, and
bb's own back (⌘[) and previous/next thread (⇧⌘[ ⇧⌘]) cover jumping back. It stays in Sections,
and a user who has it turned on keeps it. Removal is reconsidered after v2 has been used a while.

## Data and feasibility

| Need | Source | Cost |
|---|---|---|
| Full status, drafts, other plugins' row status | `experimental_ThreadStatusGlyph`, `useSidebarThreadDraft`, `useSidebarThreadRowStatus` | Low |
| Accessible state label | `PluginSidebarThread.indicatorLabel` | Low |
| Jump-shortcut hints | `useSidebarThreadShortcut` | Low |
| Branch, worktree | `PluginSidebarThread.environment` | Low |
| Archive, other actions | `experimental_useThreadActions` (bb's Archive keeps its confirmation and undo) | Low |
| Stop | `sdk.threads.stop` | Low; behaviour unverified |
| Question text for Needs you | `sdk.threads.interactions` | Medium |
| Waiting since | `latestAttentionAt` (meaning unverified) or first seen in the client | Medium |
| Stuck agent | server reads the turn watchdog event (`provider-turn-idle`) | Medium |
| Step text, turn timer | server subscribes to turn events and pushes to the app | High |
| PR attention on rows | Failing/Conflicts from bb GitHub PR Status and Thread Links; Changes/Ready need GitHub Folder's `attention` joined by URL | Medium |
| Merge | bb GitHub PR Status merge over plugin RPC (unverified) | Medium |
| Agent review of an unclaimed PR | `threads.spawn`; repo → project mapping unverified | Medium |
| ⇧⌘I | `app.commands.register` with `defaultShortcut`; free in bb's own keymap (`bb settings keyboard list`), bb leaves colliding plugin defaults unbound | Low |
| Context-window fill, rate limits | thread events only | High, later |

Dependencies on other plugins degrade quietly: without GitHub Folder, Thread Links, bb GitHub PR
Status or Automations, their parts hide, and counts never imply they are complete.

## Build order

Each slice ships alone, updates `skills/thread-tree/SKILL.md`, `README.md` and
`PLUGIN_OVERVIEW.md` for the behaviour it changes, passes tests, typecheck and build, is checked in
the live bb, and is released per [docs/workflow.md](../../../docs/workflow.md).

1. **Row foundation.** bb status glyph with drafts and row statuses; idle draws a small dim dot;
   `indicatorLabel` as the accessible label; jump-shortcut hints; spinner and pulse respect Reduce
   motion and `prefers-reduced-motion`.
2. **Row anatomy.** Fixed 32px rows; provider fixed slot with tint setting; PR icon only when
   actionable, replacing the PR line (one list-level PR refresh that pauses when hidden, replacing
   per-row timers; theme-safe colours); tooltip with branch; shared-branch warning; subagent counter
   kept.
3. **Hover actions.** Overlay shown at once, 24px targets, Stop on the spinner, compact-viewport rows.
4. **Status line filters and `/` search,** including the Running filter's flat list. Step text
   and timer can arrive later (slice 9).
5. **Needs you.** Thread items first (input with question and wait, failed, queued-failed,
   finished-unread), snooze, ⇧⌘I; then PR items of the user's threads and failed automations.
6. **Orchestrations.** Shortcut section, folded rollup glyph, fold-line bar from five subthreads,
   Archive on a finished fold line.
7. **Section summaries.** PR and Automations collapsed by default with summary headers; PR rows
   with the reason glyph.
8. **Older threads** fold.
9. **Later, costlier:** stuck-agent items, step text and turn timer, Merge, Agent review,
   context and rate-limit signals, diff stat for results to review.

## Settled questions

The owner delegated these; answers are folded into the sections above.

- Recent Activity: hidden by default, still in Sections.
- PRs in Needs you: linked PRs with failing checks, conflicts or changes requested.
- Needs you shortcut: ⇧⌘I; check Settings → Keyboard for a clash with another plugin's command.
- Stuck: 10 silent minutes, as a setting, ignoring threads with background work running.
- Archiving can remove worktrees with uncommitted changes, so bulk archive skips dirty worktrees.
