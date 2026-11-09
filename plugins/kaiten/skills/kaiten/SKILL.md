---
name: kaiten
description: Read the Kaiten sprint board with `bb kaiten board`, and know that a thread whose first message starts "Do the Kaiten card #…" was started from a card on that board. Use when asked what is on the sprint board or which card a thread works.
---

# Kaiten

The Kaiten plugin adds a **Kaiten** page to the bb sidebar with a board (the sprint board by default)
as columns of cards. Clicking a card starts a new thread in the project picked in the page header.
Its first message begins `Do the Kaiten card #<id>: <title>` and carries the card link, type, owner,
size, tags, description, checklists and the latest comments.

Rules for a thread started from a card:

- Do the work the card describes in the thread's project and follow that repository's own rules.
- Don't move the card, comment on it or edit it in Kaiten unless the user asks; report in the thread.
- For the full card or older comments use the Kaiten skills (`kaiten-cards`) with the card id.

The board from a terminal:

```sh
bb kaiten board [--json]
```

Text output lists each column except Done with its cards (`#id  title — owner`) and marks cards that
already have a thread. `--json` returns `{ board, error, fetchedAt }`.

The token comes from the plugin settings, `~/.config/kaiten/.env.local` (`KAITEN_TOKEN`) or the Kaiten
MCP's `~/.config/kaiten/config.json`. The board is the `boardId` setting; the domain the `domain` setting.
