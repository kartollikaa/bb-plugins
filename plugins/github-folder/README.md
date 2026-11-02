# GitHub Folder

A bb sidebar folder of the open GitHub pull requests that need you, in the spirit of Arc's GitHub
live folder. See [PLUGIN_OVERVIEW.md](PLUGIN_OVERVIEW.md) for what it does and
[skills/github-folder/SKILL.md](skills/github-folder/SKILL.md) for the CLI.

## Develop

```sh
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```

## Layout

- `lib/github.ts`: the GraphQL query, parsing, filters and settings. Pure, covered by `test/`.
- `lib/gh.ts`: runs the query once per gh login (`~/.config/gh-*` profiles too) and caches it;
  `viewPr` reads one PR with `gh pr view`, trying each login.
- `lib/pr-context.ts`: one PR's details from `gh pr view`, the agent-only context a thread about
  it starts with, the PR page routes, a two-minute PR cache, and the bb project whose remote is the
  PR's repository. Pure, covered by `test/`.
- `components/PrPage.tsx`: the `pr` nav panel, `/plugins/github-folder/pr/<owner>/<repo>/<n>`.
  The card draws at once from the folder data, the description arrives from `prContext`, and the
  composer is bb's `NewThreadComposer`; on submit the plugin spawns the thread with the context
  as an `agent-only` input. A row hover warms the cache.
- `lib/contract.ts`: the RPC contract. `folder` is the view both sidebars draw; `updateSettings`,
  `snooze` and `refresh` change it and invalidate the `folder` tag. `prContext` returns a PR's
  details and agent context; `prProject` the matching bb project.
- `server.ts`: settings in `bb.storage.kv`, a background refresh, RPC, `bb github-folder list`.
- `lib/sidebar-anchor.ts`, `components/FolderSection.tsx`: an app overlay that portals the folder
  above bb's own thread list, drawn with that list's row and label classes.

## With thread-tree

bb's own list has no slot for extra sections, so this plugin places its folder above the
`[data-bb-plugin="thread-list"]` element. When the thread-tree list is active that element is
absent, and thread-tree draws the same folder itself from this plugin's `folder` RPC.
If the folder disappears from bb's list after a bb upgrade, check that selector first.
