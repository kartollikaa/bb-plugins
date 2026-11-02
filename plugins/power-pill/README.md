# Power Pill

Keeps the Mac running bb awake, so agents keep working and bb stays reachable from your phone while
the screen is locked. Optionally keeps it awake with the lid closed.

A capsule button sits in the sidebar footer, left of the battery. It turns amber and shows the time
left while it's on. A click opens a popup:

- an on/off switch;
- a duration: ∞, 1 h, 2 h, 4 h or 8 h;
- **Also with the lid closed**;
- the one-time setup command when closed-lid mode isn't set up yet.

The session turns itself off when its timer runs out, or on battery when the charge runs low.

## CLI

```sh
bb power-pill status [--json]
bb power-pill on [--for 2h|90m|1h30m|forever] [--lid]
bb power-pill off
```

## Closed-lid mode

macOS always sleeps when the lid closes, whatever app holds it awake. Power Pill gets around this
with `pmset -a disablesleep 1`, which needs root, and sets it back to `0` when the session ends. A
watchdog resets it if bb dies mid-session. To allow those two commands without a password, run the
command the popup shows once. It adds this rule to `/etc/sudoers.d/power-pill`:

```
<you> ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1
```

A closed Mac that stays awake gets warm. Don't leave it running in a bag.

## Development

```sh
npm install --include=dev
npm test && npm run typecheck
bb plugin build && bb plugin reload power-pill
```

MIT.
