# bb plugins

Plugins for [bb](https://getbb.app), each in its own folder with its own README.

| Plugin | What it does |
|---|---|
| [inline-terminal](plugins/inline-terminal) | Run shell code blocks from agent replies in an interactive terminal under the block. The result goes back to the agent. |
| [thread-tree](plugins/thread-tree) | A sidebar thread list that nests child threads under their parent and shows each thread's subagents. |
| [reveal-in-finder](plugins/reveal-in-finder) | Files an agent hands over show as cards in chat, with Open in Finder, the default app or bb's preview. |
| [battery](plugins/battery) | The laptop's battery charge as an icon and percentage at the right end of the sidebar footer. |
| [thread-links](plugins/thread-links) | The PRs, Kaiten cards, docs and other links a thread mentions, in its context card, with each PR's review, checks and merge status. |
| [artifacts](plugins/artifacts) | Your published Claude Code artifacts and Codex Sites as a grid of previews, opened in bb's browser, and as cards in chat. |
| [mouse-pet](plugins/mouse-pet) | A pet mouse that runs, sits, grooms and sleeps along the bottom of the bb window. |
| [github-folder](plugins/github-folder) | A sidebar folder of the open GitHub PRs that need you, like Arc's GitHub live folder, with a menu to pick what it lists. |
| [power-pill](plugins/power-pill) | Keeps the Mac awake from a sidebar footer switch, with a timer and an optional closed-lid mode, so bb stays reachable while the Mac is locked. |

## Install

Add the catalog once, then install the plugins you want from bb's plugin store:

```sh
bb marketplace add git:github.com/kartollikaa/bb-plugins@main
```

Or install one plugin directly:

```sh
bb plugin install git:https://github.com/kartollikaa/bb-plugins.git@main --plugin reveal-in-finder
```

Only the plugin you name is installed. `bb plugin update <id>` moves it to its next release.

## Develop

```sh
git clone https://github.com/kartollikaa/bb-plugins.git && cd bb-plugins
bb plugin install path:. --plugin <name>    # a local install picks up your edits on reload
./test-all.sh                               # every plugin's tests
```

Each plugin is self-contained: its own `package.json`, lockfile, tests and agent skill. Releases are
tagged per plugin as `<name>/vX.Y.Z`.
