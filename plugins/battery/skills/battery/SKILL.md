---
name: battery
description: Read the bb server machine's battery charge with `bb battery status`. Use when asked about the laptop's battery, charge level or time left before a long job.
---

# Battery

The Battery plugin shows the charge of the machine that runs the bb server as a button at the right end
of the sidebar footer: a battery icon and the percentage. The fill is red at 20% or less, yellow up to
50%, green above. A click opens a popup with the laptop's state, plus the viewing device's own battery
when bb is open remotely (a phone) and its browser exposes one. The popup shows no time estimates;
`bb battery status` does.

From a shell:

```sh
bb battery status         # 27%, on battery, 1:13 left
bb battery status --json  # {"reading":{"percent":27,"state":"discharging","onAcPower":false,"remaining":"1:13"}}
```

`state` is one of `charging`, `discharging`, `charged`, `not-charging`, `unknown`; `remaining` is `h:mm`
or null while macOS has no estimate. `reading` is null on a machine without a battery and on any
non-macOS server: the plugin reads `pmset -g batt`.
