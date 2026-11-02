# Mouse Pet

A small grey mouse that runs along the bottom edge of the bb window. It walks, runs, sits, grooms and
sleeps, and turns around at both window edges. A click makes it hop, squeak "Pi!" and run the other
way. Only the mouse takes clicks; the strip it moves in lets them through. With the system's reduced
motion setting on, it sits still.

Disable the plugin to remove the mouse.

## How it works

- `app.tsx` mounts a content script (`lib/mouse-pet.ts`) that adds a fixed layer to `body`, draws the
  sprite as inline SVG and moves it with a `requestAnimationFrame` loop. Legs, tail, blink and the
  poses are CSS keyframes keyed on the sprite's `data-mode`. Unloading removes the layer and its style.
- `lib/pet.ts` holds the movement rules as pure functions (mode choice by weight, durations, speed,
  edge bounce, startle on click); `npm test` covers them.
- `server.ts` is empty: bb requires a server entry.

## Develop

```sh
npm install --include=dev
npm test && npm run typecheck
bb plugin build && bb plugin reload mouse-pet
```
