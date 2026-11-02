---
name: mouse-pet
description: Explains the Mouse Pet plugin, a small mouse that runs along the bottom of the bb window. Use when the user asks about the mouse, wants it gone, or finds something covering the bottom of the window.
---

# Mouse Pet

The Mouse Pet plugin puts a small grey mouse along the bottom edge of the bb window. It walks, runs,
sits, grooms and sleeps, and turns around at the window edges. A click makes it hop, squeak "Pi!" and
run the other way.

It has no CLI command, agent tool or setting. Only the mouse itself catches clicks; the strip it moves
in lets them through. To get rid of it, disable the plugin in bb's plugin settings
(`bb plugin disable mouse-pet`); enable it again to bring it back. With the system's "reduce motion"
setting on, the mouse sits still.
