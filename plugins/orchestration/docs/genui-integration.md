# Work/evidence integration decision

Investigated for issue #1 on BB 0.49.0, SDK 0.6.132 (package pin and installed
host bundle metadata), against GenUI 0.3.2 revision
`d8cac8d1781bac336214cc38981aba4a58d9c1c0`.

GenUI's package.json has no reusable renderer export. Its docs/architecture.md
(native renderer section and frontend module map) describes plugin-owned
Fence/SlotFence, component rendering and RPC-backed data loading. BB's installed
frontend-renderer-slots reference provides code-fence registration, not an API
for embedding another plugin's component in a navPanel. Installing GenUI does
not grant an embed contract. A reusable renderer package accepting typed data,
theme and explicit host/action callbacks would be needed for direct reuse.

Use a small original local presentation inspired by Metric, Status, Acceptance
and Provenance: compact task counts, status/evidence rows, dependency navigation
and expandable evidence. No GenUI source is copied; no Apache source/notices are
vended. No imports across plugin boundaries, fence registrations, catalog engine
or model calls are added. GenUI remains unchanged and optional.

Data flow remains snapshot RPC → typed LedgerSummary + BB sidebar runtime →
buildView → WorkflowHistory. The graph was indexed from this worktree and
verified against useOrchestration.ts, contract.ts and WorkflowHistory.tsx.
EvidenceMarkdown retains ledgerHostId and the existing host identity checks.
Criteria and evidence narratives remain separate; recorded revision is never
replaced by a current live revision. Unknown dates are not synthesized.

Refresh is unchanged: visible snapshot reads every 20 seconds, refresh when
visibility returns, BB sidebar state for live activity. There is no added file
watcher, polling service or promise that linked external evidence is current.
Navigation, native ThreadChat, composer and reply validation are unchanged.
The new presentation adds no animation and uses ordinary keyboard buttons.

Validation results and independent review are recorded on issue #1 after execution.

## Owner questions (2026-11-15)

The owner asked for one block to answer every open question instead of a yellow card each, ideally
GenUI's. Findings, on the same GenUI revision:

- GenUI renders through `experimental_codeFenceRenderer`, which bb calls only for fences in real chat
  messages. The SDK `Markdown` component a plugin renders does not route fences to it: a ```ui block
  in the panel shows as code. `ThreadChat` in `timeline` mode would render it, but only as a whole
  transcript, and a form's answers go to that thread. So the panel uses its own questions card.
- A GenUI `Form` with labels `Re «<ask title>»` writes `Re «<title>»: <answer>` lines, which
  `answeredAsks` reads; an empty field comes back as `—`, which counts as no answer. A form writes
  nothing until the owner changes any field, then writes every field.
- A form turns read-only after any later user row in bb's conversation outline, and a subtask's wake
  (`[bb system] … completed`) is such a row. A form in a busy orchestrator chat freezes quickly.
- Ownership: the `orchestrate` skill stays host-neutral and only writes `ask:` lines with options and
  the recommended one marked. Asking through a GenUI form in the chat, if wanted, belongs to this
  plugin, which can add instructions to orchestrator threads only (`bb.agents.contributeInstructions`;
  applies from the thread's next session start or resume). Not built: the panel card covers the need.

