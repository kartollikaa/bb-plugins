# Workflow

## Change loop

```sh
cd ~/Projects/bb/plugins/<id>
npm install --include=dev        # first time, or after package.json changes
npm test
npm run typecheck                # where the script exists; otherwise npx tsc -p .
bb plugin build                  # catches bundle and manifest errors that tsc misses
bb plugin reload <id>            # the local install picks up the new build
```

`bb plugin dev` watches the sources, rebuilds and reloads on every save. Use it for UI iteration and
stop it when done. `~/Projects/bb/test-all.sh` runs every plugin's tests.

`bb plugin list` shows each plugin's id, its source and whether it is running. After a reload, the
plugin must read `running`. If it doesn't, `bb plugin list` shows why, and `bb plugin source <id>`
shows the source and its history.

## Seeing it work

- **CLI and RPC:** call it. Run `bb <plugin-command> …`, and use `bb plugin rpc` to list and inspect
  RPC methods.
- **Agent skill:** a reload refreshes it. Start a new thread and check that an agent follows it.
- **UI (slots, directives, panels):** check in the real bb window. `bb browser-automation` can drive
  a page, but headless screenshots of bb chat have come out black. If you can't see the UI, hand the
  check to Dmitrii with exact steps and say it is unverified.
- **Tests:** keep pure logic (parsing, path handling, tree building, labels) in exported functions
  and cover them with `node --test`. Components stay thin over those functions.

## Installing

```sh
bb plugin install path:~/Projects/bb --plugin <id> --yes                                    # dev, this Mac
bb plugin install git:https://github.com/kartollikaa/bb-plugins.git@main --plugin <id>      # anyone
bb marketplace add git:github.com/kartollikaa/bb-plugins@main                               # the catalog
```

Without `--plugin`, an install fails and lists the plugin names. A path install remembers the
absolute path; after a move, install the new path. That keeps the plugin id. Check its settings with
`bb plugin config <id>` afterwards.

## Release (ask Dmitrii first)

1. In `plugins/<id>`: bump `version` in `package.json`, run `npm install` so the lockfile follows,
   and commit `<id>: release vX.Y.Z — <what the user gets>`.
2. Tag `<id>/vX.Y.Z` (annotated; the prefix is what keeps plugins' releases apart) and push the
   commit and the tag. Never move a published tag: bb refuses a tag that points somewhere new.
3. Marketplace users get it from `bb plugin update <id>`, within the range `marketplace.json` lists.
   A new major version needs that range raised.
4. bb-community: load the `submit-a-plugin` skill. Its source is this repo with `subdir` and
   `tagPrefix`. `PLUGIN_OVERVIEW.md` is the store text; keep its requirements and privacy sections
   accurate.

## Adding a plugin

```sh
cd ~/Projects/bb/plugins && bb plugin new <id> && mv bb-plugin-<id> <id>
```

Then add it to `.bb/plugins.json`, `marketplace.json` (with `icons/<id>.svg`; bb rejects an entry without an icon), the table in `README.md` and
`docs/plugins.md`, and install it with `--plugin <id>`.

## Splitting a plugin out

When a plugin needs its own repo, for example for a different visibility:

```sh
git subtree split --prefix plugins/<id> -b split/<id>
```

That branch holds the plugin at its root with its full history. Push it to the new repo, then remove
the folder and its index entries here.
