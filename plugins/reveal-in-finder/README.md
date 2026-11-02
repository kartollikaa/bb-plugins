# bb-plugin-reveal-in-finder

Renders a file an agent hands over as a card in the chat, like Codex does: an icon, the
name, its type and size, and **Open in ▾** — Finder, the default app, or bb's preview.
Clicking the card opens bb's preview (a folder opens in Finder).

An agent writes the card as a directive on its own line:

```
::file{path="/Users/me/Downloads/cats-radar-1.10.2.apk"}
```

`path` takes an absolute path, `~/…`, a `file://` URL, or a path relative to the thread's
worktree. A path that does not exist renders as "Not found". Finder and the default app run
on the Mac that runs the bb server.

From a shell: `bb reveal-in-finder show <absolute-path>`.

Install: `bb plugin install ~/Projects/bb/bb-plugin-reveal-in-finder`; after a change,
`npm test && bb plugin build && bb plugin reload reveal-in-finder`.
