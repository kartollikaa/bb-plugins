# bb-plugin-inline-terminal

Shell code blocks in agent replies get a **Run** button. Clicking it starts an
interactive shell for the thread, types the block in, and shows a live
terminal (xterm.js) right under the block. You can keep typing in it.

- `app.tsx` registers `experimental_codeFenceRenderer` for `bash`, `sh`,
  `shell`, `zsh`, `console`, `shell-session`, `terminal`. It renders bb's own
  code block (`Original`) plus the controls: Run / Run again, Ctrl-C, Panel
  (opens the same session in bb's terminal panel), Close.
- Sessions are created with `useSdk().terminals.create` in thread scope
  (`start: shell`), so the cwd is the thread's workspace. Input goes through
  `terminals.input`, output is polled with `terminals.output({ sinceSeq })`.
- The terminal id is kept in `sessionStorage` under the fence key
  (`message.id#language#index`), so scrolling away or reloading the page
  reattaches to the running session and replays its tail.
- `lib/command.ts` turns a fence body into shell input: `$ `/`% ` transcript
  lines are extracted, multi-line blocks go in as a bracketed paste.
- `skills/inline-terminal/SKILL.md` tells agents how to write runnable blocks.
- `server.ts` is an empty backend; the manifest requires one.

## Develop

```bash
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```
