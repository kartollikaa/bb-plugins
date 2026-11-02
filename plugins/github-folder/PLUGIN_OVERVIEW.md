The open GitHub pull requests that need you, as a folder at the top of the sidebar.

## What you get

- Review requests first, then your own PRs that wait on you: changes requested, failing checks,
  conflicts, or approved with nothing blocking the merge. PRs assigned to you or mentioning you
  can join them.
- Each row shows the PR title and a short reason in colour. A click opens the PR; hover shows its
  number and a snooze button that hides it until the PR changes.
- The customize button in the folder header picks what is listed: review requests with or without
  team requests, your PRs only when they need you or all of them, assigned, mentions, drafts, and
  which organizations to show. It also refreshes and shows which gh accounts are read.
- The arrow button opens GitHub's pull requests page.
- The folder sits above bb's own thread list, in that list's style. With the Thread Tree plugin's
  list, Thread Tree draws the folder in its own style instead, with the same settings.
- `bb github-folder list` prints the folder in a terminal.

## How it works

The bb server runs one GraphQL search through the `gh` CLI for every gh login on that machine
(the default one and each `~/.config/gh-*` profile) in the background and on refresh. Only GitHub
sees those requests. Settings and snoozes are stored in the plugin's storage on the bb server, so
every client shows the same folder.

## Requirements

The `gh` CLI, signed in on the bb server machine.
