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

After each completed plugin change, follow [Marketplace maintenance](#marketplace-maintenance).

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

## Release

Routine compatible updates to an already-published bb-community plugin have Dmitrii's standing
authorization. Ask first for an unpublished plugin's release, its first marketplace submission,
breaking changes, or a change of release source/ownership. Check the live entry before applying
the standing authorization; [publication.md](publication.md) is the record, not proof of publication.

1. In `plugins/<id>`: bump `version` in `package.json`, run `npm install` so the lockfile follows,
   and commit `<id>: release vX.Y.Z — <what the user gets>`.
   Before committing, also build an isolated copy with `npm ci --omit=dev --omit=optional
   --ignore-scripts` and `bb plugin build`; use `npm run test:production` when provided. A build
   with development dependencies can hide a Git installation failure.
2. Tag `<id>/vX.Y.Z` (annotated; the prefix is what keeps plugins' releases apart) and push the
   commit and the tag. Never move a published tag: bb refuses a tag that points somewhere new.
3. Marketplace users get it from `bb plugin update <id>`, within the range `marketplace.json` lists.
   Check both catalogs' ranges: even a minor version below 1.0 can fall outside a caret range.
   Update the self-hosted range and propose the community range change when necessary.
4. bb-community: load the `submit-a-plugin` skill. Its source is this repo with `subdir` and
   `tagPrefix`. `PLUGIN_OVERVIEW.md` is the store text; keep its requirements and privacy sections
   accurate.

## Marketplace maintenance

For every completed change to a plugin, before reporting the task done:

1. Check [publication.md](publication.md), the entry on `get-bb/marketplace`'s default branch,
   and the [live community catalog](https://getbb.app/marketplace/v2/marketplace.json). Match the
   entry by plugin ID and verify its source repository and subdirectory. Only plugins already in
   the live community catalog enter this automatic update loop. A self-hosted entry or an open
   first-submission PR does not enable automatic releases.
2. Compare the affected plugin directory with its latest public release tag. Ship every completed
   plugin change, including bundled skills, docs and dependencies, through the release steps above
   after tests, typecheck, build, production install build and the affected live behavior pass.
   Use a new compatible version and immutable tag. Unrelated plugins and changes confined to
   repository workflow/status docs do not need releases.
3. Check the community entry's actual source selector. A new tag within its `range` and
   `tagPrefix` makes the code update available without a marketplace PR. An entry pinned to `ref`
   needs an update PR. Update the self-hosted catalog too when its source selector changes.
4. If behavior changes the store description, overview, screenshots, branding or requirements,
   load `submit-a-plugin`, read the current marketplace contract, and synchronize the affected
   files in the marketplace fork. Copy `PLUGIN_OVERVIEW.md` into `overview/<id>.md` and refresh
   affected screenshots. Validate the marketplace and open an update PR, or update an existing
   open PR for the same work. Follow the marketplace's v1-change label requirement when applicable.
5. Update the plugin's row in [publication.md](publication.md) with the public release and every
   new marketplace PR link immediately after creation. Preserve the original submission link.
   Record review, closure and merge changes; for a first submission, keep it pending until the
   entry is live. Add a new plugin's row when the plugin is added, even before submission.
6. Verify the public tag resolves to the intended release commit and is accepted by the entry's
   selector. For metadata PRs, report the PR and checks as pending until merged and visible in the
   live catalog. Report code release and metadata publication separately if they finish at
   different times. Users choose when to install the available update with `bb plugin update`.

When an unpublished plugin is submitted with Dmitrii's approval, record its PR in the same work
session. Creating that PR does not grant automatic release authorization while review is pending.

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
