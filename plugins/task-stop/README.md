# Task Stop

Adds a stop button (■) to every row of bb's background tasks card, the bar above the composer that
reads "Running background command: …" or "Running background agent: …". bb itself can only interrupt
the whole turn; this stops one task and leaves the rest running.

- **Background command:** the plugin kills the processes running it. The agent sees the command end
  (exit 143/144) and the row disappears. No agent turn is spent.
- **Background agent:** an agent has no process of its own to kill, so the plugin sends the thread a
  short message asking the agent to call `TaskStop` on that task. The message steers a running turn
  or starts a new one, so it costs one short turn.

When a command's processes can't be found (a remote host, a provider other than Claude Code), the
plugin falls back to the message as well.

## How it works

- `lib/card.ts` reads bb's card: `section[aria-label="Background commands|agents|activity"]`, the
  header bar and the rows of `#thread-background-commands-card-body`. A row carries only its
  description, so rows are matched to tasks by description and position among same-named tasks.
  These selectors follow bb's DOM; check them first if the button disappears after a bb upgrade.
- `lib/stop-buttons.ts` is the content script: it keeps a button on each row and POSTs
  `{ threadId, description, index }` to the plugin's `/stop` route. The thread id comes from the URL.
- `server.ts` folds the thread's `backgroundTask` events (`lib/tasks.ts`) to find the running task and
  its Claude task id (`familyId`) and session (`providerThreadId`). For a command it finds
  `<tmp>/claude-<uid>/<cwd>/<session>/tasks/<task>.output`, kills the processes `lsof` reports
  writing it (SIGTERM, then SIGKILL after two seconds), and otherwise sends the stop message.

## Develop

```sh
npm install --include=dev
npm test && npm run typecheck
bb plugin build && bb plugin reload task-stop
```
