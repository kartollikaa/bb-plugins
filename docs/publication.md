# Publication status

One row per plugin. Update it in the same commit as a tag, a `marketplace.json` entry or a
bb-community PR. Verify before trusting it: `git ls-remote --tags origin` for tags,
`gh pr list -R get-bb/marketplace --author kartollikaa --state all` for the store.

Stages: **local** (only in `.bb/plugins.json`) → **self-hosted** (tagged, in `marketplace.json`,
installable with `bb marketplace add`) → **bb-community** (an entry in
[get-bb/marketplace](https://github.com/get-bb/marketplace), bb's store).

| Plugin | Self-hosted | bb-community | Next step |
|---|---|---|---|
| inline-terminal | yes (`v0.1.2`) | PR [#796](https://github.com/get-bb/marketplace/pull/796), open | Wait for merge |
| reveal-in-finder | yes (`v0.1.1`) | PR [#804](https://github.com/get-bb/marketplace/pull/804), open | Wait for merge |
| battery | yes (`v0.1.0`) | PR [#803](https://github.com/get-bb/marketplace/pull/803), open | Wait for merge |
| thread-tree | yes | not submitted | Release the GitHub folder work, then submit |
| github-folder | no tag | not submitted | Tag `v0.1.0`, add to `marketplace.json` |
| artifacts | yes (`v0.1.0`) | PR [#805](https://github.com/get-bb/marketplace/pull/805), open | Wait for merge |
| thread-links | no tag | not submitted | Tag `v0.1.0`, add to `marketplace.json` |
| power-pill | no tag | not submitted | Tag `v0.1.0`, add to `marketplace.json` |
| thread-switcher | yes (`v0.1.0`) | PR [#822](https://github.com/get-bb/marketplace/pull/822), open | Wait for merge |

## bb-community entries

Each entry lives in the marketplace repo as `entries/<id>.json`, `icons/<id>-<hash>.svg`,
`screenshots/<id>/` and `overview/<id>.md` (a copy of the plugin's `PLUGIN_OVERVIEW.md`). Its source
is this repo with `subdir: plugins/<id>` and `tagPrefix: <id>/`, so a new tag within the range reaches
users without a new PR. A change to the overview, screenshots or description needs one.

A store submission needs a LICENSE, `PLUGIN_OVERVIEW.md`, a store icon and at least one screenshot
at 1200 px wide or more. Blur thread names and private paths in screenshots.

`thread-images` was submitted once (PR #780) and withdrawn; it isn't in this repo.

## Notes

- thread-tree's GitHub folder only works with `github-folder` installed, so release `github-folder`
  before or together with that thread-tree release.
