# Thread Tree

A bb sidebar thread list where child threads nest under their parent and each
thread's provider subagents show as a counter with a status dot.

See [PLUGIN_OVERVIEW.md](PLUGIN_OVERVIEW.md) for what it does and
[skills/thread-tree/SKILL.md](skills/thread-tree/SKILL.md) for the CLI.

## Develop

```sh
npm install --include=dev
npm test
npm run typecheck
bb plugin install .
bb plugin dev
```

The thread list slot is exclusive. With several list plugins installed, pick
this one under Settings → Appearance → Sidebar, or run
`bb settings ui set sidebar.threadListProvider thread-tree/thread-tree`.

## Layout

- `server.ts`: RPCs `subagents`, `automations`, `githubPrs` and the `bb thread-tree` command.
- `src/github.ts`: the GitHub folder's query, parsing and filters; `src/gh.ts` runs it per gh login.
- `src/subagents.ts`: folds a thread's event log into its subagents.
- `src/tree.ts`: pure tree, grouping and subagent state logic.
- `src/ThreadTreeList.tsx`, `src/SubagentBadge.tsx`, `src/GithubSection.tsx`: the sidebar UI.
- `test/`: `node --test` suites for the pure modules.
