# Mouse Pet

A small grey mouse lives along the bottom edge of the bb window. It walks at low speed and bounds
at a run, skids before a fast turn, curls up to sleep and stretches when it wakes. It can stop and
look around from its haunches, turn to face you or sit with its back to you. It sometimes stops to
wash its face with a front paw or scratch behind its ear in quick bursts.

- Click the mouse to make it hop, squeak "Pi!" and bolt.
- Press and drag the mouse to pick it up by the scruff within the window. Its legs hang freely and
  its body trails the pointer as it accelerates. Release at the floor to
  set it down, or release it in motion to let it fall with the pointer's velocity.
- Pause the pointer low and just ahead of the mouse. It may take a couple of steps to sniff it.
  Lift the pointer a little during the sniff and the mouse rears up to follow.
- The mouse sometimes pulls a mouse-sized piece of cheese in from an edge and leaves it at a
  different distance each time. It may pass the cheese a few times or notice it from across the
  window and run back to take a couple of bites. It finishes the cheese over several visits.
  There is only one piece at a time.
- A piece of cheese only slightly rounds out a hungry mouse's belly. Each bite satisfies a smaller
  amount of hunger as the mouse fills up, and eating while full adds more weight. The mouse gets hungry
  and slims down over time, faster while running or otherwise active. If excess weight builds up,
  the mouse bursts into a puff and a new mouse walks in from an edge a few seconds later.

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
  `npm test` covers those modules.
- `server.ts` is empty: bb requires a server entry.

## Develop

```sh
npm install --include=dev
npm test && npm run typecheck
bb plugin build && bb plugin reload mouse-pet
```
