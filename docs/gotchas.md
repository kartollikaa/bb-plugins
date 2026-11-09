# Gotchas

Traps already hit while building these plugins. Add a new one with its symptom, so the next agent
can find it by the error text.

## SDK

- **`service refresh did not stop` after a reload or install** (plugin goes `degraded`). A background
  loop that awaits work and then a `sleep(ms, signal)` hangs when the abort arrived during the work:
  the `abort` listener is added too late. Return at once from `sleep` when `signal.aborted`, and pass
  the signal to in-flight `fetch`. `github-folder` has the same loop shape. A degraded plugin can't be
  reinstalled over; `bb plugin disable <id>` first.
- **A frontend import from the server SDK can pass a local build and fail Git installation.**
  Git installs omit dev dependencies. Keep shared RPC contracts as plain schema objects and use
  type-only SDK imports; verify with an isolated production dependency build.
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

- **Icon names outside bb's set render as a Zap.** `experimental_Icon` falls back silently for an
  unknown Lucide name (`Sparkles`, `RefreshCw` did). Declare the glyph under
  `bb.branding.experimental_icons` and reference it as `"<plugin-id>/<name>"`.
- **Claude's frames API answers 404 without Claude Code's headers.** `GET /api/frame/frames` with a
  valid OAuth token still needs `X-Frame-CP`, `X-Frame-Surface`, `X-Frame-Platform`,
  `X-Frame-Client-Version` and the `application/vnd.ant.frame-refusal+json` Accept type.
- **Timeline tool rows for MCP calls**: `toolName` is `"<server>:<tool>"` and `presentation.title`
  is the server, so a label built from the title reads `plugin_context-mode_…`. Use the part after
  `:` or `presentation.label.pending` ("Running ctx_execute").
- **Timeline approval rows carry no text**, only `target.itemId`. Look that id up among the other
  rows to get the command or file being approved.
- **`useSidebarThreads()` is the cheap source of thread state**; `sdk.threads.timeline` is a request
  per thread. Prefetch timelines in the background and cache them by `updatedAt`, or an overlay
  that opens on a keypress shows empty cards first.

- **Changing the DOM inside `dragstart` ends the drag in Chrome** (dragend fires at once). Defer
  the state change with `setTimeout(…, 0)`. Call `setDragImage` in the handler itself, before
  the DOM changes.
- **A closing height animation flashes the content back** if it unmounts on `finish`: the browser
  drops the animation a frame before React removes the node. Give the closing animation
  `fill: "forwards"`.
- **Toggling `overflow: hidden` for a height animation moves the layout** when a child has a top
  margin: the margin collapses through the box when unclipped and stays inside when clipped. Make
  the box `flow-root` and keep it clipped until it unmounts. Watch for it by sampling heights per
  `requestAnimationFrame`; a 2px jump is invisible in screenshots and reads as a blink live.
- **Test drags with the real mouse too** (`mouse.down`, stepped `mouse.move`, `mouse.up`). Synthetic
  `dragover` on a chosen element hid that empty space and gaps weren't drop places.
- **A drag that starts on text inside a `draggable` block drags the page selection** (it can reach
  bb's title bar). Give the block `select-none` and cancel `dragstart` when its target isn't the
  block or a link.

- **No `:has()` in plugin CSS** (`group-has-[…]`, `peer-has-[…]`, `has-[…]`). Plugin styles load
  into bb's page, and thread-tree's `group-has-[:focus-visible]/row:*` made every DOM change in
  the chat restyle the page: inline terminals measuring glyphs froze thread entry for seconds. Track
  the state in a `data-*` attribute and use `group-data-[…]`; thread-tree's `test/styles.test.ts`
  guards it.

- **Radix menu triggers open on `pointerdown`, touch included.** On mobile a swipe that starts on a
  menu button (closing the sidebar sheet, scrolling) opened the menu. thread-tree's
  `useTapToOpenMenu` cancels the touch `pointerdown` and opens on `click`, which a swipe never
  fires. Use it for every `DropdownMenu` trigger. It also closes an open menu on a touch over the
  trigger from a capture listener: Radix dismisses from a bubbling `document` `pointerdown` or focus
  loss, and on bb mobile a second tap on the trigger reached neither.
- **bb has no API to stop one background task.** The bridge's `thread/stop` only takes `interrupt`
  (the whole turn) or `release`, and nothing calls the Claude SDK's `stopTask`. A `backgroundTask`
  event's `familyId` is Claude's task id and `providerThreadId` its session; task-stop kills a
  command through its `tasks/<id>.output` file and asks the agent to `TaskStop` an agent.
- **A headless check of a content script works on bb's own web UI.** Open
  `http://127.0.0.1:<bb port>/projects/<p>/threads/<id>` in a `bb browser-automation` headless
  session and assert the DOM (`p.evaluate`); an element screenshot of the target renders fine even
  when `screencapture` is unavailable.

## Tooling

- **Profiling the bb page:** a DevBrowser page has `createCDPSession()`, so `Profiler.*` and
  `Performance.getMetrics` (`RecalcStyleDuration` vs `LayoutDuration`) work on the headless bb at
  `serverUrl` from `~/.bb/bb-app-runtime.json`.
- **DevBrowser** (`bb browser-automation`) has no `page.waitForTimeout` and no `locator().first`.
  Use `await new Promise(r => setTimeout(r, ms))` and `page.evaluate`. It has no
  `setViewportSize` either. `page.shot()` files live in the session's tmp dir and are deleted by
  `browser-automation close`: read them before closing.
- **Holding a modifier in DevBrowser**: `keyboard.down("Control")`, then `press("Tab")`, then
  `up("Control")` fires the real keyup the thread-switcher commits on. `press("Control+Tab")`
  releases at once.
- **Headless screenshots of bb chat** came out black. Text that is still streaming sits in collapsed
  groups and may not be in the DOM.
- **Headless captures ignore a scrolled sidebar.** After `scrollTop` or `mouse.wheel`, the DOM
  reports the new offset but the screenshot still shows the top of the list. Check positions with
  `getBoundingClientRect()`, or fold the sections above (that profile's localStorage only) to bring
  a block into frame.
- **Synthetic drags:** dispatch `DragEvent`s with one shared `new DataTransfer()` from
  `page.evaluate`. They exercise the handlers but not the drag ghost or real pointer motion.
- **Mobile bb in DevBrowser:** `setViewport({width: 390, height: 844, isMobile: true, hasTouch:
  true})` and `page.touchscreen` (`touchStart`/`touchMove`/`touchEnd`, `tap`). The sidebar sits
  under the chat at `z-0`, so a sidebar button can be laid out and still not take the tap. Tap
  `Toggle sidebar` first and check `elementFromPoint` before every gesture.
- **Multi-touch in DevBrowser:** `page.touchscreen` drives one finger. For a pinch, send
  `Input.dispatchTouchEvent` (`touchStart`, stepped `touchMove`, `touchEnd`) with two `touchPoints`
  through `p.createCDPSession()`. It zooms the page for real (`visualViewport.scale`), so it is a
  usable positive control for zoom blocking. Pinch along the vertical axis: horizontal finger travel
  also drives bb's sidebar and side-panel swipes. `Emulation.setPageScaleFactor` silently stops
  touch events reaching the page for the rest of the session; zoom with a real spread instead.
- **Don't unmount an element while a finger is on it.** bb's sidebar swipe waits for that finger's
  touchend on `window`, and a touch whose target was removed never bubbles there. Keep a touch
  overlay mounted (fade it, `pointer-events: none`) until `touches.length === 0`.
- **zsh** has no `timeout` command. Don't wrap commands in it.

## Installs and catalogs

- **`marketplace.json` entries need `icon`.** Without it, `bb marketplace add` fails with
  `HTTP 422: invalid marketplace manifest: plugins.0.icon: Invalid input`. To validate the catalog
  locally: `bb marketplace add path:~/Projects/bb`, then `bb marketplace remove kartollikaa`.
- **Switching a git-installed plugin to a path install** fails with `plugin id "<id>" is already
  installed from git:…; remove it first`. Run `bb plugin remove <id> --yes`, then install the path.
  A path-to-path move needs no removal.

- **Frontend RPC contracts:** use a schema object directly or a type-only contract import.
  Importing `defineRpcContract` from the backend SDK in a frontend bundle can pass a dev
  build and fail a production-only install, where the SDK is not a runtime dependency.
