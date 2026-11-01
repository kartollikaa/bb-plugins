# bb-plugin-inline-terminal

Shell code blocks in agent replies get a **Run** button. Clicking it starts an
interactive shell for the thread, runs the block in it, and shows a live
terminal (xterm.js) right under the block. When the block finishes, its exit
code and output go to the agent as hidden context and the agent replies at
once, like `!command` in Claude Code. Nothing extra appears in the chat.

## How it works

- `app.tsx` registers `experimental_codeFenceRenderer` for `bash`, `sh`,
  `shell`, `zsh`, `console`, `shell-session`, `terminal`. It renders bb's code
  block (`Original`) plus Run / Run again, Ctrl-C, Panel (same session in bb's
  terminal panel), Close, and the result badge (exit code, Sent to agent /
  Send to agent).
- `lib/command.ts` → `wrapperArgv(command, nonce)` starts the session with
  `terminals.create({ start: { mode: "argv" } })`. The launcher writes a
  temporary rc (zsh via `ZDOTDIR` shims for `.zshenv`/`.zprofile`/`.zshrc`,
  bash via `--rcfile`, others via `ENV`) that loads the user's own startup
  files and then runs the block with `eval` inside the interactive shell. So
  `cd`, venvs, aliases and history stay in the session the user keeps typing
  in. Command and nonce are argv, never spliced into the script.
- The rc prints OSC 777 markers `bb-inline-terminal;<nonce>;start` and
  `…;exit;<code>`. An EXIT trap covers `exit`/`set -e`, an INT trap covers
  Ctrl-C (reports 130, stops the rest of the block, keeps the shell). The
  per-run nonce stops output that happens to contain a marker from faking it.
- xterm's OSC handler catches the exit marker, takes the rendered text between
  the start marker and the cursor, and sends it with `sdk.threads.send`
  (`queue-if-active`) as a single `agent-only` text part: command, exit code
  and output (tail-clipped, fenced longer than any backtick run inside).
- Output polling backs off while idle and wakes immediately after each
  keystroke, so the exit marker is seen as soon as the command ends.
- Per-tab `sessionStorage` keeps the terminal id per fence and a run record
  (`command`, `nonce`, `reported`, `delivered`) per terminal, so a reload or
  scroll-out reattaches, replays the tail and never reports a run twice. The
  fence key changes with the props, so a reused component instance picks up
  the right fence's state; identical keys get separate slots.
- Setting `autoSendResult` (default on) in the plugin settings turns
  auto-send off; results then wait for **Send to agent**.
- `skills/inline-terminal/SKILL.md` tells agents how to write runnable blocks
  and what the result message means.

## Develop

```bash
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```

`npm test` includes `test/wrapper_pty.py`, which runs the launcher in a real
pty under zsh and bash (state kept, `exit 4`, Ctrl-C).
