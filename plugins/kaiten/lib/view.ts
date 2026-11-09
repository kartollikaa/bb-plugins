import type { BoardColumn } from "./kaiten";

export type Filters = { mine: boolean; showDone: boolean; query: string };

export function filterColumns(columns: BoardColumn[], filters: Filters): BoardColumn[] {
  const query = filters.query.trim().toLowerCase();
  return columns
    .filter((column) => filters.showDone || !column.done)
    .map((column) => ({
      ...column,
      cards: column.cards.filter((card) => {
        if (filters.mine && !card.mine) return false;
        if (query === "") return true;
        const haystack = [String(card.id), card.title, card.owner ?? "", ...card.tags].join(" ").toLowerCase();
        return haystack.includes(query);
      }),
    }));
}

export function dueLabel(dueDate: string, now: Date): { text: string; overdue: boolean } {
  const due = new Date(dueDate);
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    text: due.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    overdue: day(due) < day(now),
  };
}
