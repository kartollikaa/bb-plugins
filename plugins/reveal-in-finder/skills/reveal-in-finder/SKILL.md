---
name: reveal-in-finder
description: Use when pointing the user at a file or folder on this Mac, or when the user asks to open, show or reveal a file in Finder.
---

# Reveal in Finder

The user can show any file link from a chat message in Finder: hover the link and press
**Finder**, or ⌥-click it. Link files and folders by absolute path (`[name](/Users/…/file)`
or a `file://` URL) so the link resolves; a path relative to the worktree only works for
files inside it.

When the user asks you to show something in Finder, run:

```
bb reveal-in-finder <absolute-path>
```

It exits 1 with "File not found" when the path does not exist.
