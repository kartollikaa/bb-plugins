Run the commands an agent suggests without copying them anywhere, and let the
agent see what happened.

## What you get

- A **Run** button under every `bash`, `sh`, `shell`, `zsh`, `console`,
  `shell-session` and `terminal` code block in agent replies.
- A live, interactive terminal right under the block: answer prompts, type
  passwords, press Ctrl-C, run follow-ups in the same session.
- When the block finishes, its exit code and output go to the agent as
  hidden context and it responds right away; the chat stays clean. Turn this
  off in the plugin settings to send results by hand with **Send to agent**.
- **Panel** moves the same session into bb's terminal panel; **Close** ends it.

## How it works

The shell starts in the thread's workspace on the thread's host, with your
shell's startup files loaded. Nothing runs until you click Run.
