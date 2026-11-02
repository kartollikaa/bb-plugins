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

## Tooling

- **DevBrowser** (`bb browser-automation`) has no `page.waitForTimeout` and no `locator().first`.
  Use `await new Promise(r => setTimeout(r, ms))` and `page.evaluate`.
- **Headless screenshots of bb chat** came out black. Text that is still streaming sits in collapsed
  groups and may not be in the DOM.
- **zsh** has no `timeout` command. Don't wrap commands in it.
