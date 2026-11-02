# bb-plugin-reveal-in-finder

Shows a file linked in a bb chat in Finder, on the Mac that runs the bb server.

- Hover a file link in a message: a **Finder** button appears beside it.
- Or hold ⌥ (Option) and click the link.
- From a shell: `bb reveal-in-finder <absolute-path>`.

A file link is any link whose address starts with `file:` — bb turns file paths
in agent messages into such links. A path that no longer exists reports
"File not found" instead of opening anything.

Install: `bb plugin install ~/Projects/bb-plugins/bb-plugin-reveal-in-finder`, then
`bb plugin build` after each change.
