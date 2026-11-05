// Reads bb's background tasks card (ThreadScreen). The selectors follow bb's DOM; check them first after a bb upgrade.
const CARD_LABELS: Record<string, string> = {
  "Background commands": "command",
  "Background agents": "agent",
  "Background activity": "task",
};
const CARD_SELECTOR = Object.keys(CARD_LABELS)
  .map((label) => `section[aria-label="${label}"]`)
  .join(", ");
const BODY_SELECTOR = "#thread-background-commands-card-body";
const DESCRIPTION_SELECTOR = 'span[title]:not([title^="Model: "])';
const THREAD_ROUTE = /^\/projects\/[^/]+\/threads\/([^/]+)\/?$/;

export interface CardEntry {
  /** The element the stop button is appended to. */
  host: Element;
  description: string;
  /** Position among running tasks with this description, in card order. */
  index: number;
  kind: string;
}

export function threadIdFromPath(pathname: string): string | null {
  const match = THREAD_ROUTE.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function numberDuplicates<T extends { description: string }>(rows: readonly T[]): (T & { index: number })[] {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const index = counts.get(row.description) ?? 0;
    counts.set(row.description, index + 1);
    return { ...row, index };
  });
}

/**
 * One entry per task row. The header shows the first task unless the card is in summary
 * mode ("Running 3 background commands"), which has no titled description span.
 */
export function cardEntries(root: ParentNode): CardEntry[] {
  const entries: CardEntry[] = [];
  for (const card of root.querySelectorAll(CARD_SELECTOR)) {
    const kind = CARD_LABELS[card.getAttribute("aria-label") ?? ""] ?? "task";
    const rows: Omit<CardEntry, "index">[] = [];
    const header = card.firstElementChild;
    const headerDescription = header?.querySelector(DESCRIPTION_SELECTOR);
    if (header && headerDescription && !headerDescription.closest(BODY_SELECTOR)) {
      const bar = header.firstElementChild;
      // A button can't hold another button; a plain bar takes the stop button inside its ring.
      const host = bar && bar.tagName !== "BUTTON" && bar.contains(headerDescription) ? bar : header;
      rows.push({ host, description: headerDescription.getAttribute("title") ?? "", kind });
    }
    for (const span of card.querySelectorAll(`${BODY_SELECTOR} ${DESCRIPTION_SELECTOR}`)) {
      const row = span.parentElement;
      if (row) rows.push({ host: row, description: span.getAttribute("title") ?? "", kind });
    }
    entries.push(...numberDuplicates(rows));
  }
  return entries;
}
