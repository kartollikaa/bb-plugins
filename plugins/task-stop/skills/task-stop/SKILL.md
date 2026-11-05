---
name: task-stop
description: Explains the Task Stop plugin, the stop button on each row of bb's background commands and agents card, and the "Stop the background … call TaskStop" message it sends. Use when such a message arrives, or when the user asks how to stop one background task.
---

# Task Stop

The Task Stop plugin puts a ■ button on every row of bb's background tasks card above the composer.

- **Background command:** the plugin kills its processes itself. You then get the usual task
  notification that the command failed with exit code 143 or 144. The user stopped it on purpose;
  don't restart it or treat it as a failure to debug unless they ask.
- **Background agent:** the plugin sends the thread a message such as
  `Stop the background agent "<description>" now: call TaskStop with task_id <id>. The user pressed its stop button.`
  It comes from the user's click. Call `TaskStop` with exactly that `task_id`, do nothing else, and
  reply in one short line. If the task has already finished, say so in one line.

The plugin has no CLI command or settings.
