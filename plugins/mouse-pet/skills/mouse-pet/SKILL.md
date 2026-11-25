---
name: mouse-pet
description: Explains the Mouse Pet plugin, a small mouse that runs along the bottom of the bb window. Use when the user asks about the mouse, wants it gone, or finds something covering the bottom of the window.
---

# Mouse Pet

The Mouse Pet plugin puts a small grey mouse along the bottom edge of the bb window. It bounds
when running, skids before a fast turn and stretches after sleeping. It sometimes pauses facing
toward or away from you. A click makes it hop, squeak "Pi!" and bolt.

Hold the primary button on the mouse for about half a second to pick it up and carry it inside the
window. It hangs by its forepaws and follows the pointer's momentum. Release near the floor to set
it down, or higher up to let it drop. If the window loses focus, the mouse returns to the floor.
To invite a sniff, leave the pointer still, low and
just ahead of the mouse. Lift it slightly during the sniff and the mouse rears up to follow.

It has no CLI command, agent tool or setting. Only the mouse itself catches clicks; the strip it moves
in lets them through. To get rid of it, disable the plugin in bb's plugin settings
(`bb plugin disable mouse-pet`); enable it again to bring it back. With the system's "reduce motion"
setting on, the mouse sits still and shows "Pi!" on a click.
