# Thread Switcher

Switch between your recent bb threads from the keyboard. Hold Control and press Tab: a row of cards
opens over the window, one per thread, each with a small preview of the latest messages in that chat.
Under the preview: the thread's title on up to two lines, its project and how long ago it was
active, and its branch. A dot next to the title shows the thread's status, in the same colors as Thread Tree: amber needs your
input, red failed, blue (pulsing) working, green done. A thread waiting for your answer also gets an
amber outline, and its card shows the question or the approval it is waiting on instead of the
latest messages.

- Press Tab again to move right, Shift+Tab to move left. Arrow keys work too.
- Let go of Control to open the selected thread. Enter does the same, Esc closes without switching.
- A quick Control+Tab tap jumps straight back to the previous thread.
- Click a card to open it.

The current thread comes first. By default the threads that need you come next: those waiting for
your input, then failed ones. The rest are ordered by when you last opened them, then by latest
activity. Archived and hidden threads are left out.

## Settings

Settings → Installed plugins → Thread Switcher:

- **Hotkey** — `Control+Tab` by default. Type it (`Option+Tab`, `Command+Shift+K`, `Control+\``) or
  use **Record shortcut** and press the keys. It needs Control, Option or Command, because the
  switcher stays open while you hold that modifier. If the hotkey already uses Shift, Shift no
  longer moves backwards; use the arrow keys.
- **Threads shown** — how many cards the switcher shows, 2 to 20, 6 by default.
- **Threads that need you first** — on by default. Turn it off to order cards by recency only.

```sh
bb plugin config thread-switcher set hotkey "Option+Tab"
bb plugin config thread-switcher set threadCount 8
bb plugin config thread-switcher set attentionFirst false
```

## How it works

An app-wide overlay listens for the hotkey. The order of recently opened threads is kept in the
browser's local storage, so each bb window or device has its own. Previews come from each thread's
timeline through bb's SDK; they are fetched in the background while you work, so the cards open
filled in. Opening the switcher doesn't mark threads as read.

## Development

```sh
npm install --include=dev
npm test
npm run typecheck
bb plugin build
```
