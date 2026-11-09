Your Kaiten sprint board as a bb page: columns of cards, and a click on a card starts a thread that
works it, with the card's description, checklists and comments as context.

## What you get

- A **Kaiten** page with one board's columns and cards, filters for text, your own cards and Done.
- A click on a card starts a thread in the project you picked; a card that already has a thread opens it.
- `bb kaiten board` lists the board in a terminal.

## Requirements

A Kaiten API token in the plugin settings, in `~/.config/kaiten/.env.local` (`KAITEN_TOKEN`) or in
`~/.config/kaiten/config.json`. Set the board id and domain in the settings for a board other than the default.

## Privacy

The plugin calls only your Kaiten host, from the bb server, with your token. The token stays on the
server. A thread's first message includes the card's text, so it goes to the agent provider of that thread.
