---
name: mouse-pet
description: Explains the Mouse Pet plugin, a small mouse that runs along the bottom of the bb window. Use when the user asks about the mouse, wants it gone, or finds something covering the bottom of the window.
---

# Mouse Pet

The Mouse Pet plugin puts a small grey mouse along the bottom edge of the bb window. It bounds
when running, skids before a fast turn and stretches after sleeping. It sometimes sits on its
haunches and watches the pointer, or pauses facing toward or away from you. A click makes it hop,
squeak "Pi!" and bolt.

During a pause, the mouse sometimes washes its face with a front paw or scratches behind its ear
in quick bursts.

Press and drag the mouse by the scruff to carry it inside the window. Its legs hang and its body
follows the pointer's momentum. Release near the floor to set
it down, or higher up to let it drop. If the window loses focus, the mouse returns to the floor.
To invite a sniff, leave the pointer still, low and
just ahead of the mouse. Lift it slightly during the sniff and the mouse rears up to follow.

The mouse can pull one mouse-sized piece of cheese in at a window edge and leave it at a random
distance. It can pass the cheese before it takes a bite. After leaving it alone for a while it
may run straight over and take two bites, then leave the rest for later. It can fetch another piece
once it finishes the current one.

Each completed bite satisfies a fraction of the mouse's remaining hunger. A first piece of cheese
rounds out the belly a little, while eating when already full adds more weight. Time and
activity make it hungry again and slim it down, with running using more energy than walking.
If too much excess weight builds up, it bursts into a puff. A new mouse walks in from an edge
after a short pause.

It has no CLI command, agent tool or setting. Only the mouse itself catches clicks; the strip it moves
in lets them through. To get rid of it, disable the plugin in bb's plugin settings
(`bb plugin disable mouse-pet`); enable it again to bring it back. With the system's "reduce motion"
setting on, the mouse sits still and shows "Pi!" on a click.
