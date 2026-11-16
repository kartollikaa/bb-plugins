# False completion: source and reconciliation

## Root cause

A schema-v1 export can succeed with only the first Markdown table under Subtasks.
A blank line before additional task rows ends that table. The export therefore reports
only the completed rows. Active work described in checkpoint prose is not a task record.
The view accurately counted the exported rows, but its overall Done claim was too broad.

Two independent View weaknesses made that incomplete plan harder to spot:

- Live reconciliation considered only direct children. A running worker below an idle,
  completed coordinator was absent even when BB supplied its parent chain.
- Ledger discovery selected the newest modification time for duplicate Orchestrator IDs.
  A copied history file retaining that header could replace the canonical plan.

The status line also allowed Done while the orchestrator itself was running.

## View protections

Explicit BB parent links and ledger-linked sessions anchor descendant reconciliation.
Active or pending descendants become live rows without rewriting recorded delivery states.
No statuses are inferred from narrative, thread silence, or archiving. Unrelated trees and
cycles do not acquire membership. Ambiguous ledger identities and task identifiers omitted
from a successful export produce source errors rather than misleading totals.

Tests cover a split table, localized headings, fenced examples, a nested linked coordinator,
an active grandchild under completed work, pending descendant input, unrelated/cyclic trees,
an idle descendant control, duplicate snapshot identity, and an active orchestrator.

## Follow-up brief for orchestrate (not implemented here)

Make export/check report malformed or split Subtasks tables and refuse a successful partial
plan without a diagnostic. Keep all active owner work represented by task rows. Store history
outside scanned ledger roots or remove live Orchestrator identity from snapshots. Prefer an
explicit canonical-ledger identity contract over modification time. A future View integration
can consume that contract once the exporter defines it. Preserve schema-v1 compatibility;
do not infer completed work from silence or extract task status from checkpoint prose.

## Validation boundary

Unit tests and bundle checks exercise the changed policy. Installed-source reload and live BB
observations require coordinating integration with the owner of the configured local checkout.
A locally built isolated worktree is not evidence that the installed plugin runs that source.
