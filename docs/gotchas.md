# Gotchas

Traps already hit while building these plugins. Add a new one with its symptom, so the next agent
can find it by the error text.

## SDK

- **CLI subcommand names** must match `[a-z0-9-]+`. Otherwise install fails with
  `cli command commands[0] must be { name: [a-z0-9-]+ ... }`.
- **Message directives** (`app.slots.messageDirective({ id, component })`): the component gets
  `{ attributes, source, message: { id, threadId, turnId, projectId }, openWorkspaceFile }`.
  Attributes are untrusted strings. Resolve and validate paths on the server, never in the app.
- **Relative paths** in a thread resolve against the thread's environment:
  `bb.sdk.threads.get` → `environmentId` → `bb.sdk.environments.get` → `.path`.
- **File preview:** `useBbNavigate().experimental_openFilePreview({ target: { kind: "host", hostId,
  path }, location: null })`. `hostId` comes from `bb.sdk.system.config().primaryHostId`. The call
  returns `false` when it can't open the file, so have a fallback.
- **Overlays anchored to chat elements** lose their position when the chat auto-scrolls. Render
  inline through a slot instead of positioning over the transcript. Dmitrii also found the hover
  button "not neat", and the inline card replaced it.
- **Another plugin's nav panel can't be opened with `toPluginPanel`**: it only reaches the calling
  plugin's panels, and `useSidebarNavigation().activate` takes no subPath. thread-tree opens
  github-folder's PR page with `history.pushState` plus a `popstate` event; bb's router follows it.
  If that row stops navigating after a bb upgrade, check this first.
- **bb's own composer has no submit hook**: a customization can't add hidden input to what it
  sends. To send `agent-only` context with a new thread, render `NewThreadComposer` in your own
  page and call `threads.spawn` from its `onSubmit`.
- **GitHub attachment images** (`github.com/user-attachments/assets/<id>`) don't load outside a
  signed-in github.com session. The REST API's `body_html` (`Accept:
  application/vnd.github.full+json`) has `private-user-images.githubusercontent.com` URLs signed for
  five minutes; github-folder redirects to them from a plugin route instead of embedding them.

## Tooling

- **DevBrowser** (`bb browser-automation`) has no `page.waitForTimeout` and no `locator().first`.
  Use `await new Promise(r => setTimeout(r, ms))` and `page.evaluate`.
- **Headless screenshots of bb chat** came out black. Text that is still streaming sits in collapsed
  groups and may not be in the DOM.
- **zsh** has no `timeout` command. Don't wrap commands in it.

## Installs and catalogs

- **`marketplace.json` entries need `icon`.** Without it, `bb marketplace add` fails with
  `HTTP 422: invalid marketplace manifest: plugins.0.icon: Invalid input`. To validate the catalog
  locally: `bb marketplace add path:~/Projects/bb`, then `bb marketplace remove kartollikaa`.
- **Switching a git-installed plugin to a path install** fails with `plugin id "<id>" is already
  installed from git:…; remove it first`. Run `bb plugin remove <id> --yes`, then install the path.
  A path-to-path move needs no removal.
