See your laptop's charge without leaving bb: a battery icon and percentage sit at the right end of
the sidebar footer.

## What you get

- The charge of the machine running the bb server, refreshed every minute and on click.
- A tooltip with the state (charging, on battery, charged) and the time left.
- Red text at 20% or less while on battery.
- `bb battery status [--json]` for terminals and agents.

## Requirements

The bb server runs on macOS; the plugin reads `pmset -g batt`. On other systems it shows a dash.

## Privacy

The reading stays on your bb server and its connected clients. Nothing is sent anywhere else.
