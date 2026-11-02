# Battery

Shows the battery charge of the machine running the bb server in bb's sidebar footer: a battery icon
and the percentage, at the right end of the footer row. The battery fill is red at 20% or less,
yellow up to 50% and green above; a bolt marks charging. A click opens a popup with a row per device
(icon, name, state, coloured battery, percentage), without time estimates. When bb is open on another
device, such as a phone, the popup adds that device's own battery where its browser reports one.
The footer button always shows the laptop.

`bb battery status [--json]` prints the same reading in a terminal.

## How it works

- `server.ts` runs `pmset -g batt` and serves the parsed reading at `GET /status` (local auth) and
  through the CLI. macOS only; elsewhere the reading is empty.
- `app.tsx` mounts a content script (`lib/footer-percent.ts`) that adds its own button to the footer
  row, polls `/status` every minute and when the window becomes visible, draws the popup, and removes everything on
  unload. It is not a registered footer item, so it doesn't sit in the footer's item list.
- `lib/battery.ts` parses `pmset` output and formats labels; `npm test` covers it.

## Develop

```sh
npm install --include=dev
npm test && npm run typecheck
bb plugin build && bb plugin reload battery
```
