An Orchestration tab for a thread that runs other threads with the orchestrate plugin. It answers
one question: does anything need you, and is the team moving?

## What you get

- One status sentence on top: "Nothing needs you", "One decision for you", or "S5 has gone quiet".
- A card for each thing that waits on you: a subtask's question, a delivery ready to land, a pending
  approval, a line the ledger keeps for the owner. Answer and Release start a reply in the
  orchestrator's composer; you send it yourself.
- The team: one row per subtask with its state and latest step. A row opens to show the model,
  context use, rotations and the gate.
- The same sentence as a row in the thread's context card.

## How it works

The plugin reads the orchestrate ledger through its export script and combines it with bb's live
thread state. A subtask counts as stuck when it stops reporting while working, or when its gate keeps failing. Everything stays on the machine that runs bb.
