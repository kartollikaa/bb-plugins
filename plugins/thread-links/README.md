# Thread Links

Adds a "Links" section to bb's thread context card: every pull request, issue, Kaiten card, Buildin
page, Figma file and other site the thread's prompts and agent replies mention, one row per page.
Pull requests come first, then trackers and docs; inside a kind the latest mention leads. Eight rows
show, the rest sit behind "N more".

A GitHub pull request row is one line plus a size line under it:

- the leading icon is the PR's state in colour: draft (grey), open (green), open with conflicts
  (red), merged (violet), closed (red);
- after the title, a check (approved) or a diff icon (changes requested), with the reviewers in its
  tooltip;
- a CI dot: green passed, red failed, amber and pulsing while jobs run. Clicking it opens a popup
  with every job, failed first; a job opens its run;
- the line under it: `+additions −deletions · N files`.

Open pull requests refresh every minute while the card is shown.

`bb thread-links list <thread-id> [--json]` prints the same list.

## How it works

- `server.ts` reads the thread's `client/turn/requested` (prompts, minus system turns) and
  `item/completed` agent-message events, page by page and only past the last one it read, and marks
  the `links` read stale when the thread's events advance. Tool output is never scanned.
- `lib/links.ts` extracts, canonicalises (one row per PR whatever tab or comment the URL points at),
  classifies and sorts the links. `lib/pull-request.ts` folds `gh pr view --json` into statuses and
  chips, keeping only the latest run of each check.
- PR and issue status runs `gh` on the bb server: the default login, then every `~/.config/gh-*`
  profile with a `hosts.yml`, remembering per owner which one worked. Results are cached briefly.
- `app.tsx` registers the card section. It shows only where bb draws the context card (the
  `threadContextCard` experiment, a thread opened as a page, not on phones).

## Develop

```sh
npm install --include=dev
npm test && npm run typecheck
bb plugin build && bb plugin reload thread-links
```
