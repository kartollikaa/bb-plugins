---
name: reveal-in-finder
description: Use when handing the user a file or folder you produced or that they should open (a build, an export, a report, a screenshot), or when they ask to show a file in Finder.
---

# File cards

When you hand the user a file or folder to open, put a file card on its own line in your
reply instead of only a link:

```
::file{path="/absolute/path/to/file.apk"}
```

- One card per deliverable; ordinary mentions of source files stay plain links.
- `path` may be absolute, `~/…`, or relative to the thread's worktree.
- The card shows name, type and size, and lets the user open it in Finder, the default app,
  or bb's preview. A missing path renders "Not found", so write the card after the file exists.
- Never put the directive inside inline code or a code block — it then stays literal text.

When the user asks you to show something in Finder, run `bb reveal-in-finder show <absolute-path>`.
