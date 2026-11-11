# Publication status

One row per plugin in this repository, with its actual bb-community listing and marketplace PRs.
The [author page](https://getbb.app/marketplace/author/kartollikaa) groups the live listings;
[get-bb/marketplace](https://github.com/get-bb/marketplace) holds their metadata and reviews.

**Published** means the entry is present in the
[live community catalog](https://getbb.app/marketplace/v2/marketplace.json). **Pending** means a
first-submission PR is open but the plugin is not listed. **Not submitted** means no submission
PR exists. A release tag or inclusion in this repo's `marketplace.json` alone is self-hosted
distribution, not community publication. Recheck these sources before acting on the snapshot.

## Plugins in this repository

| Plugin | Latest public release | Community status | Marketplace listing / entry | Marketplace PRs |
|---|---|---|---|---|
| [inline-terminal](../plugins/inline-terminal) | [v0.1.2](https://github.com/kartollikaa/bb-plugins/tree/inline-terminal/v0.1.2) | Published | [Listing](https://getbb.app/marketplace/inline-terminal) · [Entry](https://github.com/get-bb/marketplace/blob/main/entries/inline-terminal.json) | Submission [#796](https://github.com/get-bb/marketplace/pull/796), merged |
| [reveal-in-finder](../plugins/reveal-in-finder) | [v0.1.1](https://github.com/kartollikaa/bb-plugins/tree/reveal-in-finder/v0.1.1) | Published | [Listing](https://getbb.app/marketplace/reveal-in-finder) · [Entry](https://github.com/get-bb/marketplace/blob/main/entries/reveal-in-finder.json) | Submission [#804](https://github.com/get-bb/marketplace/pull/804), merged |
| [battery](../plugins/battery) | [v0.1.0](https://github.com/kartollikaa/bb-plugins/tree/battery/v0.1.0) | Published | [Listing](https://getbb.app/marketplace/battery) · [Entry](https://github.com/get-bb/marketplace/blob/main/entries/battery.json) | Submission [#803](https://github.com/get-bb/marketplace/pull/803), merged |
| [thread-tree](../plugins/thread-tree) | [v0.2.12](https://github.com/kartollikaa/bb-plugins/tree/thread-tree/v0.2.12) | Published | [Listing](https://getbb.app/marketplace/thread-tree) · [Entry](https://github.com/get-bb/marketplace/blob/main/entries/thread-tree.json) | Submission [#823](https://github.com/get-bb/marketplace/pull/823), merged; PR icon, folder + and touch icons metadata update [#830](https://github.com/get-bb/marketplace/pull/830), merged |
| [thread-switcher](../plugins/thread-switcher) | [v0.1.1](https://github.com/kartollikaa/bb-plugins/tree/thread-switcher/v0.1.1) | Published | [Listing](https://getbb.app/marketplace/thread-switcher) · [Entry](https://github.com/get-bb/marketplace/blob/main/entries/thread-switcher.json) | Submission [#822](https://github.com/get-bb/marketplace/pull/822), merged; pinch gesture description and overview update [#837](https://github.com/get-bb/marketplace/pull/837), open, needs `v1-change` label |
| [artifacts](../plugins/artifacts) | [v0.1.1](https://github.com/kartollikaa/bb-plugins/tree/artifacts/v0.1.1) | Pending, changes requested | No live listing; [proposed entry](https://github.com/get-bb/marketplace/pull/805/files) | Submission [#805](https://github.com/get-bb/marketplace/pull/805), open |
| [github-folder](../plugins/github-folder) | No public tag | Not submitted | No live listing | None |
| [thread-links](../plugins/thread-links) | No public tag | Not submitted | No live listing | None |
| [mouse-pet](../plugins/mouse-pet) | No public tag | Not submitted | No live listing | None |
| [kaiten](../plugins/kaiten) | No public tag | Not submitted | No live listing | None |
| [power-pill](../plugins/power-pill) | No public tag | Not submitted | No live listing | None |

All tagged plugins above are also in the self-hosted [catalog](../marketplace.json). The untagged
plugins are local entries in [.bb/plugins.json](../.bb/plugins.json).

## Other repository

| Plugin / source repository | Community status | Marketplace listing / entry | Marketplace PRs |
|---|---|---|---|
| [thread-images](https://github.com/kartollikaa/bb-plugin-thread-images) | Pending | No live listing; [proposed entry](https://github.com/get-bb/marketplace/pull/828/files) | Submission [#828](https://github.com/get-bb/marketplace/pull/828), open; earlier [#780](https://github.com/get-bb/marketplace/pull/780), closed without merge |

Thread Images is maintained outside this repository. Its current submission uses the separate
repository's `^0.1.2` release range; do not release it from this checkout.

## Keeping this record current

- After every completed change to a **published** plugin, follow
  [Marketplace maintenance](workflow.md#marketplace-maintenance): release the change and update
  the store metadata when affected. This is Dmitrii's standing instruction for routine compatible
  updates. Pending and unsubmitted plugins remain outside that automatic release loop.
- Record every first submission and later update PR here as soon as it is created. Keep the
  original submission link and add update links in the same row. Refresh status after review,
  closure or merge. A merged PR is published only after its entry reaches the live catalog.
- Update release links with each public tag and keep the self-hosted catalog consistent. If only
  this record or repository workflow instructions change, no plugin release is needed.

Verify public tags and PRs with:

```sh
git ls-remote --tags origin
gh pr list -R get-bb/marketplace --author kartollikaa --state all --limit 100
gh pr view <number> -R get-bb/marketplace --json state,reviewDecision,url,files
```

Check the default-branch entry's `source`, not just its display name. These plugins use
`subdir: plugins/<id>` and `tagPrefix: <id>/`; a compatible new tag within the entry's range
requires no marketplace PR. Changes to the source selector, description, overview, icon or
screenshots require one. In particular, a caret range below 1.0 may exclude the next minor version.

## Submission assets

A submission needs the plugin's LICENSE and `PLUGIN_OVERVIEW.md`. Each community entry lives in
`entries/<id>.json`, with its vendored icon, screenshots and
`overview/<id>.md` copied from the plugin's `PLUGIN_OVERVIEW.md`. Load `submit-a-plugin` and read
the current marketplace contract before preparing or changing those files. Keep screenshots free
of private thread names and paths.

Thread Tree's GitHub folder section requires `github-folder` to be installed; that companion is
not yet published to the community marketplace.
