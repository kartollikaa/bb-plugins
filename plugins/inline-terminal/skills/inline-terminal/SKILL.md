---
name: inline-terminal
description: How shell code blocks in your replies become runnable for the user. Use when you suggest a command the user should run themselves, or when the user asks to run a command from chat.
---

# Inline Terminal

The Inline Terminal plugin puts a **Run** button under every fenced code block
tagged `bash`, `sh`, `shell`, `zsh`, `console`, `shell-session` or `terminal`
in your replies. Clicking it opens a real interactive shell for this thread
(in the thread's workspace directory) right under the block, types the block
in, and lets the user keep typing in that session: answer prompts, enter
passwords, press Ctrl-C, run follow-ups.

## Writing runnable blocks

- Tag the fence with one of the languages above. Untagged or other-language
  blocks get no button.
- Put only commands in a `bash`/`sh` block. Every line is typed into the shell.
- In a `console` or `shell-session` transcript, prefix commands with `$ ` (or
  `% `). Only those lines run; output lines are skipped.
- A multi-line block is pasted as one unit (bracketed paste), so the shell
  runs it the way it would run pasted text.
- The button appears only after the block finishes streaming.

## Limits

- The user runs the block, not you. Don't assume it ran or read its output.
  Ask for the result, or run the command yourself if you need it.
- The session belongs to the thread and also shows up in its terminal panel
  (**Panel** button). **Close** ends the shell.
