# Team roles

The agent roles of the [`team`](https://github.com/kartollikaa/kartollika-ai-hub) Claude Code plugin,
inside bb. Open **Team roles** in the sidebar.

- **List.** Every role with its intent, access (read-only or edit, shell, web) and the model and
  effort it runs at in each runtime. Above it: the installed version, whether the generated files match
  their sources, and whether the Codex agents are installed and current.
- **Role.** The tier, effort and per-runtime details: agent name, blocked tools, session features, the
  limits a runtime does not enforce, the source and generated files (they open as a preview) and the
  full prompt each runtime gets, rendered or raw.
- **Propose a change.** Write what should change in a role (or the team). bb starts a thread in the bb
  project of the team plugin's source repository with your words as the message and a hidden brief for
  the agent: which files define the role, what it resolves to now and which checks follow.
- CLI: `bb team-roles list [--json]`.

## Read-only

The page changes nothing. It reads `roles.json` from the installed plugin and runs only the plugin's
read-only modes: `render_roles.py resolve <role> --runtime <runtime>` and `render_roles.py --check`,
and the dry run of `install_codex_agents.py`, always with `python3 -B -I`. A pending Codex update is
shown as a command for you to run. Editing a role means changing the plugin's source repository, so
the install is never edited.

Where the plugin is found: `installed_plugins.json` of Claude Code (user scope, `$CLAUDE_CONFIG_DIR`
respected), else the newest folder under `plugins/cache` when there is no `team@` entry at all. A `team@` entry without a usable user-scope install is a named error. The **Team plugin folder** setting
(`teamRoot`) reads another folder instead, such as a source checkout of `plugins/team`.

Needs `python3` on the bb server's `PATH`. Not published; it is not in the marketplace catalog.

## Develop

```sh
npm install --include=dev
npm test
npm run typecheck
bb plugin build
```
