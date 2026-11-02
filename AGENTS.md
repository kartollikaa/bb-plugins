# bb plugins — agent guide

Dmitrii's plugins for [bb](https://getbb.app) live in one repo, `github.com/kartollikaa/bb-plugins`,
cloned at `~/Projects/bb`. Each plugin sits in `plugins/<id>/` and is self-contained: its own
`package.json`, lockfile, tests, README and agent skill. bb installs one plugin at a time from a
subfolder, so nothing at the root may become a dependency of a plugin.

## Read before working

- [docs/plugins.md](docs/plugins.md): what each plugin does, how it is installed, its state.
- [docs/workflow.md](docs/workflow.md): the loop for a change (build, test, reload, check in the
  live app), how a release is cut, and how a plugin is added or split out.
- [docs/gotchas.md](docs/gotchas.md): SDK and tooling traps that have already cost time. Add one
  whenever you hit a new trap.
- [docs/publication.md](docs/publication.md): which plugins are released, queued, or submitted.
  Update it with every tag, catalog entry or submission.
- Load the `bb-plugin-authoring` skill before touching plugin code. It routes to the SDK references
  for the installed bb version, and those references are the API contract. Don't write SDK calls
  from memory.

## Repo map

```
.bb/plugins.json   index: plugin name → ./plugins/<id>   (bb install --plugin <id>)
marketplace.json   catalog for bb's store: one entry per plugin, git source + tag range
icons/<id>.svg     each plugin's store icon (required by the catalog)
plugins/<id>/      one plugin
docs/              these guides
test-all.sh        every plugin's tests
```

A new or renamed plugin goes into all three: `plugins/`, `.bb/plugins.json` and
`marketplace.json` with an icon in `icons/`, plus the table in `README.md` and `docs/plugins.md`.

## Rules

- **Plugins stay independent.** Don't import code from another plugin or from the root, don't add a
  root `package.json` or npm workspaces, and don't add a shared lockfile. A plugin must build alone
  from its own folder; that is what lets bb install it, and what keeps a split into its own repo a
  one-command job. Duplicated vendored UI (`components/ui`) is expected.
- **One commit touches one plugin**, except repo-wide files (`docs/`, the indexes, `README.md`).
  Start the subject with the plugin id: `reveal-in-finder: render handed-over files as cards`.
- **SDK version is pinned** (`@get-bb/plugin-sdk` in devDependencies, `engines.bbPluginSdk`).
  After a bb upgrade, run `bb plugin types` in the plugin before trusting type errors.
- **`dist/` and `node_modules/` are never committed.** bb builds from source on install.
- **Agent-facing docs live in the plugin's own `skills/<id>/SKILL.md`.** That skill describes the
  plugin's commands, directives and settings. Update it in the same commit as the behaviour change.
  The plugin's `README.md` is for people and is what GitHub shows on its folder.
  `PLUGIN_OVERVIEW.md` is the store text.
- **Done means seen working:** tests and a typecheck pass, the bundle builds, the plugin is reloaded,
  and the changed behaviour was checked in the running bb. A green build alone doesn't count; see
  `docs/workflow.md`. If you can't check something visually, say so instead of claiming it works.
- **Ask Dmitrii before:** tagging a release, submitting to the bb-community marketplace, or
  disabling or uninstalling a plugin he uses. The repo is public, so never commit anything private.
  Commits and pushes to `main` are fine once tests pass. There is no PR flow.
- Commits end with the attribution trailer the harness gives.
- Comments: none by default. Only a fact the code can't show, one line.

## Shell notes

The Bash tool runs zsh, and cwd persists between calls. Use absolute paths or
`cd ~/Projects/bb/plugins/<id> && …` in every command.
