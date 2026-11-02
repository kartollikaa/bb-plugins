Keep your Mac awake from bb's sidebar footer, so agents keep running and bb stays reachable from
your phone while the screen is locked, or even with the lid closed.

## What you get

- A capsule button in the sidebar footer, amber with the time left while it's on.
- A popup with an on/off switch and a duration: until you turn it off, 1, 2, 4 or 8 hours.
- Closed-lid mode, which keeps the Mac awake after you close the lid.
- Safety stops: the session ends on its timer or when the battery runs low, and normal sleep comes back
  even if bb crashes.
- `bb power-pill on|off|status` for terminals and agents.

## Requirements

The bb server runs on macOS. Closed-lid mode needs a one-time sudo rule that allows only
`pmset -a disablesleep 0|1`; the popup shows the command to add it.

## Privacy

Everything runs on your bb server. Nothing is sent anywhere.
