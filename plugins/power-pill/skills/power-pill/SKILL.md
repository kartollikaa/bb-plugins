---
name: power-pill
description: Keep the bb server's Mac awake with `bb power-pill`, for a set time or indefinitely, optionally with the lid closed. Use when the user wants the Mac to stay awake while locked or closed, asks why bb is unreachable after locking the Mac, or asks about the pill button in the sidebar footer.
---

# Power Pill

Power Pill keeps the Mac that runs the bb server from sleeping, so agents keep running and bb stays
reachable from the phone while the screen is locked. Its button sits in the sidebar footer, left of
the battery: a capsule icon, amber with the time left while it is on. A click opens a popup with an
on/off switch, a duration (∞, 1 h, 2 h, 4 h, 8 h) and "Also with the lid closed".

```sh
bb power-pill status                 # Off. The Mac sleeps as usual / Awake, 1:24 left
bb power-pill on                     # until turned off
bb power-pill on --for 2h            # also 90m, 1h30m, a bare number of minutes, forever
bb power-pill on --lid               # keep awake with the lid closed too
bb power-pill off
bb power-pill status --json          # {"session":{"startedAt","endsAt"|null,"closedLid"},"closedLidReady",...}
```

`on` replaces the current session. A session survives a plugin reload and a bb restart until its
timer runs out.

## How it works

- **Lid open** (screen locked or not): `caffeinate -i -m -s -w <bb pid>`. The display still turns off
  on its own timer.
- **Lid closed**: macOS ignores sleep assertions when the lid closes, so the plugin also runs
  `sudo -n pmset -a disablesleep 1` and sets it back to `0` when the session ends. A detached
  watchdog sets it back if the bb server dies without cleaning up.
- The session ends by itself on its timer, or on battery at the charge in `batteryFloor` (`status --json`).

## Closed-lid setup

Closed-lid mode needs a sudo rule that lets the user run exactly those two `pmset` commands without
a password. Until it exists, `status` prints `Closed-lid mode: needs setup` and the setup command,
and `on --lid` fails with it. The user runs the command once in Terminal; it writes
`/etc/sudoers.d/power-pill` and validates it with `visudo`. Never run it on the user's behalf.

If `status` reports `macOS sleep is disabled` while Power Pill is off, another tool set
`disablesleep`; `sudo pmset -a disablesleep 0` restores normal sleep.
