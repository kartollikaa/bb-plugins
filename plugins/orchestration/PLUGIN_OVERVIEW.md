An Orchestration view for a thread that runs other threads with the orchestrate plugin. It answers
one question: does anything need you, and is the team moving?

## What you get

- The orchestrator's thread opens on this view, with its chat in a rail you can fold away. Folded,
  or on a phone, the chat's composer stays docked under the view, so you can delegate without
  opening the chat. Full chat takes you back to the normal thread view and remembers that for the
  thread. The Orchestration view switch in the title bar (also in plugin settings) turns the view off or on for every orchestrator.
- One status sentence on top: "Nothing needs you", "One decision for you", or "S5 has gone quiet".
- A card for each thing that waits on you: a subtask's question, a delivery ready to land, a pending
  approval, an ask the ledger keeps for the owner, titled with what is asked, with quick replies and
  links to its PR and thread. A quick reply sends itself to the orchestrator in one click
  (queued if it is mid-turn). Answer and Release start a reply in the orchestrator's composer;
  you send it yourself.
- The team: one row per subtask with its state and latest step. A row opens to show the model,
  context use, rotations and the gate.
- The same sentence as a row in the thread's context card.

## How it works

The plugin reads the orchestrate ledger through its export script and combines it with bb's live
thread state. A subtask counts as stuck when it stops reporting while working, or when its gate keeps failing. Everything stays on the machine that runs bb.
