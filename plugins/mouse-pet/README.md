# Mouse Pet

A small grey mouse lives along the bottom edge of the bb window. It takes an even four-beat step
at low speed and trots with alternating diagonal pairs at a run. It skids before a fast turn,
curls up to sleep and stretches when it wakes. It can stop and
look around from its haunches, turn to face you or sit with its back to you. It sometimes stops to
wash its face with a front paw, scratch behind its ear, or hop on its own. It has four variants
each for walking, running and sleeping. Gait variations share the same paw placement and vary
the height of the steps and the tail's sway. The torso stays level through the stride.
Once in a while the mouse takes a few steps toward you from a front-facing pose and stays in
the foreground until it turns its back and walks away.

- Click the mouse to make it hop, squeak "Pi!" and bolt.
- Several quick clicks send it into a burrow at the nearest edge. It also takes breaks in the
  burrow when left alone. The same mouse comes back out after a short while.
- Press and drag the mouse to pick it up by the scruff within the window. Its legs hang freely and
  its body trails the pointer as it accelerates. Release at the floor to
  set it down, or release it in motion to let it fall with the pointer's velocity.
- Pause the pointer low and just ahead of the mouse. It may take a couple of steps to sniff it.
  Lift the pointer a little during the sniff and the mouse rears up to follow.
- The mouse sometimes pulls a mouse-sized piece of cheese in from an edge and leaves it at a
  different distance each time. It may pass the cheese a few times or notice it from across the
  window and run back to take a couple of bites. It finishes the cheese over several visits.
  There is only one piece at a time. Sometimes it pushes the piece or jumps onto it and makes it slide.
- A piece of cheese only slightly rounds out a hungry mouse's belly. Each bite satisfies a smaller
  amount of hunger as the mouse fills up, and eating while full adds more weight. The mouse gets hungry
  and slims down over time, slowly even while sleeping and faster while running or otherwise
  active. With enough cheese it becomes almost round and both walks and runs more slowly.

Only the mouse takes clicks. With reduced motion on, it sits still and shows "Pi!" on a click.

Disable the plugin to remove the mouse.

## How it works

- `app.tsx` mounts a content script (`lib/mouse-pet.ts`) that adds a fixed layer to `body`, draws the
  sprite as inline SVG, and runs the movement and gestures with a `requestAnimationFrame` loop.
  Pointer capture keeps a held mouse attached to its pointer. Losing focus, hiding the page, or
  canceling the pointer sets the mouse back on the floor. Unloading removes the layer and listeners.
- `lib/pet.ts` holds autonomous movement, `lib/animation.ts` samples the gait and hop, and
  `lib/interaction.ts` holds the grip and sniff geometry. `lib/snack.ts` tracks fetching and eating.
  `lib/metabolism.ts` tracks fullness and satiety separately from movement and poses.
  `lib/burrow.ts` and `lib/perspective.ts` handle retreats and foreground transitions.
  `npm test` covers those modules.
- `server.ts` is empty: bb requires a server entry.

## Develop

```sh
npm install --include=dev
npm test && npm run typecheck
bb plugin build && bb plugin reload mouse-pet
```
