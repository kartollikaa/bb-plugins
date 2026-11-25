# Mouse Pet

A small grey mouse lives along the bottom edge of the bb window. It walks at low speed and bounds
at a run, skids before a fast turn, curls up to sleep and stretches when it wakes. When it stops for
a moment, it can turn to face you or sit with its back to you.

- Click the mouse to make it hop, squeak "Pi!" and bolt.
- Hold it for about half a second, then move the pointer to carry it within the window. It hangs
  by its forepaws and responds to the pointer's speed in both directions. Release at the floor to
  set it down, or release it in motion to let it fall with the pointer's velocity.
- Pause the pointer low and just ahead of the mouse. It may take a couple of steps to sniff it.
  Lift the pointer a little during the sniff and the mouse rears up to follow.

Only the mouse takes clicks. With reduced motion on, it sits still and shows "Pi!" on a click.

Disable the plugin to remove the mouse.

## How it works

- `app.tsx` mounts a content script (`lib/mouse-pet.ts`) that adds a fixed layer to `body`, draws the
  sprite as inline SVG, and runs the movement and gestures with a `requestAnimationFrame` loop.
  Pointer capture keeps a held mouse attached to its pointer. Losing focus, hiding the page, or
  canceling the pointer sets the mouse back on the floor. Unloading removes the layer and listeners.
- `lib/pet.ts` holds autonomous movement, `lib/animation.ts` samples the gait and hop, and
  `lib/interaction.ts` holds the grip and sniff geometry. `npm test` covers those modules.
- `server.ts` is empty: bb requires a server entry.

## Develop

```sh
npm install --include=dev
npm test && npm run typecheck
bb plugin build && bb plugin reload mouse-pet
```
