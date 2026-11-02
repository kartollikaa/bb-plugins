---
name: github-folder
description: List the open GitHub pull requests that need the user (review requests, their PRs with changes requested, failing checks, conflicts or ready to merge) with `bb github-folder list`. Use when asked what PRs need attention or what to review next.
---

# GitHub Folder

The GitHub Folder plugin shows a folder of open pull requests that need the user at the top of
the bb sidebar. The same list is available from a terminal:

```sh
bb github-folder list [--json]
```

Text output is one line per PR, most urgent first: the reasons, `owner/repo#number`, and the
title. Snoozed PRs are counted on the last line. `--json` returns `{ items, snoozed, accounts,
error, fetchedAt }`; each item has `pr` (`url`, `number`, `title`, `repo`, `owner`, `author`,
`isDraft`, `updatedAt`, `review`, `ci`, `conflicts`, `sources`) and `attention`, the reasons:
`review`, `changes_requested`, `ci_failed`, `conflicts`, `ready`, `assigned`, `mentioned`. An
empty `attention` means one of the user's PRs listed because the folder shows all of them.

Clicking a row in the folder opens a page with the PR as a context card above a new-thread
composer. A thread started there carries the PR's title, URL, status, branch and description as
an agent-only part of its first message, starting with `[github-folder]`; the user doesn't see
it in the chat. Read the rest (diff, review comments) with `gh pr view` / `gh pr diff`.

The command refreshes from GitHub first. It reads every `gh` login on the bb server machine;
when it reports it can't reach GitHub, check `gh auth status` there.

What the folder lists (sources, drafts, organizations, snoozes) is set by the user from the
customize button in the folder header. The CLI follows those settings; there is no command to
change them.
