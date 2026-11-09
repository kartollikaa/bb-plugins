# Kaiten

The Kaiten sprint board inside bb. Open **Kaiten** in the sidebar, click a card, and a new thread
starts working on it.

- Columns and cards of one board (default: the Sprint board). Sub-columns such as Coding and Code
  review show as a chip on the card. Done is hidden until you turn it on.
- Filters: text, **Mine** (cards you own or are a member of), **Done**.
- **Threads start in** picks the bb project for new threads; the choice is remembered.
- A card with a live thread shows a **Thread** chip, and a click opens that thread instead of starting
  another. Archive the thread and the card is free again.
- The hover arrow on a card opens it in Kaiten.
- CLI: `bb kaiten board [--json]`.

## What the thread gets

The first message holds the card's title, link, type, owner, size, tags, description, checklists and
the latest comments, then asks the agent to do the work in the project and not to touch the card in
Kaiten unless you ask.

## Token and board

The token is read, in this order, from the plugin setting, `~/.config/kaiten/.env.local`
(`KAITEN_TOKEN`, optional `KAITEN_DOMAIN`) and the Kaiten MCP's `~/.config/kaiten/config.json`
(`token`, `url`). The token never reaches the browser. Change the board with the **Board id** setting
(the number in the board's Kaiten URL) and the host with **Kaiten domain**.

## Develop

```sh
npm install --include=dev
npm test
npm run typecheck
bb plugin build
```
