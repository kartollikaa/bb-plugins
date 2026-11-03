---
name: thread-switcher
description: Explains the Thread Switcher plugin, the Control+Tab overlay that previews recent bb threads and switches between them, and its hotkey and thread-count settings. Use when the user asks how to switch threads from the keyboard, wants to change the switcher's shortcut or card count, or reports that Control+Tab does something unexpected.
---

# Thread Switcher

Holding the hotkey (Control+Tab by default) opens a row of cards over the bb window, one per recent
thread, each with a preview of that chat's latest messages. Pressing the key again moves right,
Shift moves left, arrow keys work too. Letting go of the modifier opens the selected thread; Enter
does the same and Esc cancels. A quick tap goes back to the previous thread. Cards are ordered by when
the user last opened each thread in this browser, then by latest activity; archived and hidden
threads are skipped.

Each card has a status dot: amber needs input (a pending question or approval), red failed, blue
pulsing working, green done — the same rules and colors as Thread Tree's sidebar. A card whose thread
needs input also has an amber outline.

## Settings

```sh
bb plugin config thread-switcher                       # show values
bb plugin config thread-switcher set hotkey "Option+Tab"
bb plugin config thread-switcher set threadCount 8     # 2–20, default 6
```

- `hotkey`: modifiers and one key joined by `+`. Modifiers: `Control`/`Ctrl`, `Option`/`Alt`,
  `Command`/`Cmd`, `Shift`. At least one of Control, Option or Command is required. Keys: letters,
  digits, `Tab`, `Space`, `` ` ``, `[`, `]`, `,`, `.`, `/`, `;`, `'`, `-`, `=`, `\`, arrows, `F1`–`F24`.
  If the hotkey includes Shift, Shift no longer reverses direction.
- The plugin's settings page also has **Record shortcut**, which saves whatever the user presses.

## Limits

- The recent-thread order lives in the browser's local storage, so each window or device keeps its
  own.
- The switcher catches the hotkey before bb does. If the user picks a combination bb or the OS uses,
  the switcher wins inside bb, and the OS wins before the key reaches bb (Command+Tab never arrives).
