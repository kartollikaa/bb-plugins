See every link a thread talks about in its context card, with the live status of each pull request.

## What you get

- A "Links" section listing the PRs, issues, Kaiten cards, Buildin pages, Figma files and other sites
  mentioned in the thread's messages, one row per page, PRs first.
- For each GitHub PR: the most urgent status beside the title, and chips for review, reviewers,
  checks (failed ones by name), conflicts, auto-merge and size.
- Clicking a row opens the link.
- `bb thread-links list <thread-id> [--json]` for terminals and agents.

## Requirements

PR and issue status needs the GitHub CLI (`gh`) logged in on the machine running the bb server.

## Privacy

Links are read from the thread's messages on your bb server. PR status is fetched with your own `gh`
login; nothing else leaves the machine.
