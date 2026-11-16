---
name: team-roles
description: Show the team plugin's agent roles with `bb team-roles list` — model and effort per runtime, whether the generated files and the Codex agents are current — and route a change to a role. Use when asked which roles exist, which model or effort a role runs at, whether team or its Codex agents are up to date, or to change a role. Also use when a thread's agent-only message starts with `[team-roles]`.
---

# Team roles

The Team roles plugin adds a **Team roles** page to the bb sidebar. It is read-only: it shows the roles
of the installed `team` Claude Code plugin and never changes the plugin, Claude Code's config or the
Codex agents.

## Read the roles

```sh
bb team-roles list [--json]
```

Text output: the team version, key, scope and whether it is enabled; its root folder; the
generated-files state; the Codex state with its folder; then one line per role with its model and
effort per runtime and its access (`edit` or `read-only`, `shell`, `web`). Exit 0 when the install was
found and `roles.json` parsed; otherwise 1 with the reason on stderr.

`--json` prints one object: `install` (`root`, `version`, `key`, `scope`, `commit`, `enabled`,
`source`, `others`) or null with `installError`; `roles` (`name`, `intent`, `tier`, `effort`,
`access`, `shell`, `web`, `source`, `runtimes.<runtime>` with `agent`, `model`, `effort`,
`disallowed_tools`, `features`, `unenforced`) with `rolesError`; `generated` and `codex` with `state`
and their problem lines; `checkedAt`.

- `generated.state`: `current`, `stale`, `invalid` or `unknown`. It comes from `render_roles.py --check`.
- `codex.state`: `installed`, `pending`, `conflict`, `not-installed`, `blocked` or `unknown`. It comes
  from the dry run of `install_codex_agents.py`; `codex.applyCommand` is a command for the owner to run.
- There is no `show` command. For a role's full prompt run
  `python3 -B -I <root>/scripts/render_roles.py resolve <role> --runtime <claude-code|codex>`,
  with `<root>` from `list`. That mode only prints.

## What this plugin never does

It never runs `install_codex_agents.py --apply` or `--force`, `render_roles.py` without `resolve` or
`--check`, or a plugin update. Don't run them for the owner either, unless they ask: the Codex install
and the update are their steps.

## Changing a role

A role is defined in the source repository of the `team` plugin (`plugins/team/roles/<role>.md` and
`plugins/team/adapters/runtimes.json`), then regenerated and checked there. Never edit the installed
copy under `~/.claude/plugins/cache`: an update overwrites it. The owner starts a change from the
**Propose a change** button on the page, which opens a thread in the bb project of that repository.

A request that only concerns one project belongs in that project's `AGENTS.md` or `CLAUDE.md`, which
every role reads first.

## Threads started from the page

Their first message is the owner's request. A hidden agent-only message starting `[team-roles]` follows
it with the installed version, the source files, what the role resolves to now and the steps after the
change. Follow it: change the source, regenerate, run the repository's checks, and leave the version
bump, the plugin update and the Codex `--apply` to the owner, listing them in your report.

## Setting

`teamRoot` (empty by default) points the page and the CLI at another folder holding the team plugin,
for example a source checkout of `plugins/team`, to preview a change before release.
