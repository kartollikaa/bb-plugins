---
name: inline-terminal
description: How shell code blocks in your replies become runnable for the user, and how their results come back to you. Use when you suggest a command the user should run themselves, when the user asks to run a command from chat, or when a message reports "Ran `…` in the inline terminal".
---

# Inline Terminal

The Inline Terminal plugin puts a **Run** button under every fenced code block
tagged `bash`, `sh`, `shell`, `zsh`, `console`, `shell-session` or `terminal`
in your replies. Clicking it opens an interactive shell for this thread (in
the thread's workspace, with the user's rc files loaded) right under the
block, runs the block in it, and leaves the shell open: the user can answer
prompts, enter passwords, press Ctrl-C and type follow-ups. `cd`, activated
venvs and variables set by the block stay in that session.

## Results come back to you

When the block finishes, the plugin posts a user message to this thread:
a visible line "Ran `<command>` in the inline terminal — exit N." plus an
agent-only part with the full command, exit code and output (long output keeps
its tail). React to it like the user pasted the result: explain a failure,
suggest the next step, or carry on with the task. If the thread is busy, the
message queues until your current turn ends. Users can turn auto-send off in
the plugin settings; then they press **Send to chat** themselves.

Only the block's own run is reported. Commands the user types afterwards in
the same terminal are not.

## Writing runnable blocks

- Tag the fence with one of the languages above. Untagged or other-language
  blocks get no button.
- Put only commands in a `bash`/`sh` block. The whole block runs as one script
  in the user's shell, the way it would if pasted.
- In a `console` or `shell-session` transcript, prefix commands with `$ ` (or
  `% `). Only those lines run; output lines are skipped.
- One task per block: the reported exit code is the block's last command
  (or the status `exit`/`set -e` ended it with; Ctrl-C reports 130).
- The button appears only after the block finishes streaming.

## Limits

- The user decides whether to run it. Until a result message arrives, don't
  assume the block ran.
- The session belongs to the thread and also shows up in its terminal panel
  (**Panel** button). **Close** ends the shell.
