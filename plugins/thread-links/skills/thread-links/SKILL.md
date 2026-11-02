---
name: thread-links
description: List the links a bb thread mentions with `bb thread-links list`, and know that a full URL in a reply shows up in the thread context card with live PR status. Use when asked which PRs, cards or docs a thread touched, or when handing the user a PR or document.
---

# Thread Links

The Thread Links plugin adds a "Links" section to the thread context card. It lists every URL that
the thread's prompts and agent replies mention, one row per page. Tool output is not scanned, so a
link only shows up once someone writes it in a message.

- Write full URLs (`https://github.com/<owner>/<repo>/pull/<n>`), not `#123` or a bare branch name.
  A markdown link's text becomes the row label for ordinary sites.
- A GitHub PR row shows its state as a coloured icon (draft, open, conflicts, merged, closed), a
  review icon (approved or changes requested), a CI dot (pulsing while jobs run; a click lists the
  jobs) and its size on a second line. Issues show open or closed.
- PR status comes from `gh` on the bb server, so it needs a `gh` login that can see the repo.

From a shell:

```sh
bb thread-links list "$BB_THREAD_ID"         # kind, label and URL per line, PRs first
bb thread-links list "$BB_THREAD_ID" --json  # [{url, kind, label, host, github, firstSeq, lastSeq, mentions}]
```

`kind` is one of `pull-request`, `issue`, `kaiten`, `buildin`, `figma`, `commit`, `repository`, `web`.
