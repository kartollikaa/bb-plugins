# Publication status

One row per plugin. Update it in the same commit as a tag, a `marketplace.json` entry or a
bb-community submission. Verify against the repo with `git ls-remote --tags origin` before trusting it.

Stages: **local** (only in `.bb/plugins.json`) → **self-hosted** (tagged, in `marketplace.json`,
installable with `bb marketplace add`) → **bb-community** (submitted to bb's store).

| Plugin | Stage | Latest tag | Unreleased on main | Icon | License | `PLUGIN_OVERVIEW.md` | Next step |
|---|---|---|---|---|---|---|---|
| inline-terminal | self-hosted | `v0.1.2` | `repository` field fix only | yes | yes | yes | Submit to bb-community |
| thread-tree | self-hosted | `v0.1.0` | GitHub folder (2 commits) | yes | yes | yes | Release `v0.2.0`, raise `range` in `marketplace.json` |
| reveal-in-finder | self-hosted | `v0.1.0` | none | yes | no | no | Add LICENSE and `PLUGIN_OVERVIEW.md`, then submit |
| github-folder | queued | none | everything | yes | yes | yes | Tag `v0.1.0`, add to `marketplace.json` |
| thread-links | queued | none | everything | yes | no | yes | Add LICENSE, tag `v0.1.0`, add to `marketplace.json` |
| battery | queued | none | everything | no | no | yes | Add icon and LICENSE, tag `v0.1.0`, add to `marketplace.json` |

## bb-community

No plugin has been submitted. Nothing in the repo records a submission, so treat all as not submitted
until a row here says otherwise. Submission needs Dmitrii's go-ahead; see `docs/workflow.md`.

## Notes

- thread-tree's GitHub folder only works with `github-folder` installed, so release `github-folder`
  `v0.1.0` before or together with thread-tree `v0.2.0`.
- Checked 2026-11-02 against `origin/main` at `46ba48b`.
