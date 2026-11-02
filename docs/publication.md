# Publication status

One row per plugin. Update it in the same commit as a tag, a `marketplace.json` entry or a
bb-community PR. Verify before trusting it: `git ls-remote --tags origin` for tags,
`gh pr list -R get-bb/marketplace --author kartollikaa --state all` for the store.

Stages: **local** (only in `.bb/plugins.json`) → **self-hosted** (tagged, in `marketplace.json`,
installable with `bb marketplace add`) → **bb-community** (an entry in
[get-bb/marketplace](https://github.com/get-bb/marketplace), bb's store).

| Plugin | Self-hosted | bb-community | Next step |
|---|---|---|---|
| inline-terminal | yes (`v0.1.2`) | PR [#796](https://github.com/get-bb/marketplace/pull/796), open | Push the monorepo source fix, then wait for merge |
| reveal-in-finder | yes (`v0.1.1`) | entry ready, PR not opened | Open PR from `submit-reveal-in-finder` |
| battery | yes (`v0.1.0`) | entry ready, PR not opened | Open PR from `submit-battery` |
| thread-tree | yes | not submitted | Release the GitHub folder work, then submit |
| github-folder | no tag | not submitted | Tag `v0.1.0`, add to `marketplace.json` |
| thread-links | no tag | not submitted | Add LICENSE, tag `v0.1.0`, add to `marketplace.json` |

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
