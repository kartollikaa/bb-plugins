import type { RefObject } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { StillGlyph } from "./ThreadGlyph";
import { FILTER_GLYPH } from "./statusGlyph";
import { STATUS_FILTERS, statusSummary, type StatusFilter, type StatusFilterCounts } from "./statusFilters";

const LINE_BUTTON =
  "flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-2xs tabular-nums outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring";
const KEY_HINT = "rounded border border-sidebar-border px-1 text-[10px] leading-3.5 text-sidebar-foreground/45";

/** The four counts are filter toggles; `/` or the search icon swaps them for an inline search box. */
export function StatusLine({
  counts,
  filter,
  onFilter,
  searchOpen,
  query,
  onQuery,
  onOpenSearch,
  onCloseSearch,
  inputRef,
}: {
  counts: StatusFilterCounts;
  filter: StatusFilter | null;
  onFilter: (filter: StatusFilter | null) => void;
  searchOpen: boolean;
  query: string;
  onQuery: (query: string) => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  if (searchOpen) {
    return (
      <div role="search" className="flex h-5 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-sidebar-border bg-sidebar px-1.5 text-sidebar-foreground/50 focus-within:border-sidebar-ring">
        <Icon name="Search" aria-hidden className="size-3 shrink-0" />
        <input
          ref={inputRef}
          autoFocus
          data-thread-search=""
          type="text"
          value={query}
          aria-label="Search threads by title, branch, PR number or project"
          placeholder="Title, branch, PR #, project"
          onChange={(event) => onQuery(event.target.value)}
          onBlur={() => {
            if (query.trim() === "") onCloseSearch();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            onCloseSearch();
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-xs text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/40"
        />
        <span aria-hidden className={KEY_HINT}>esc</span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
      <span role="status" className="sr-only">{statusSummary(counts)}</span>
      {STATUS_FILTERS.map(({ id, label }) => {
        const count = counts[id];
        const pressed = filter === id;
        return (
          <button
            key={id}
            type="button"
            data-status-filter={id}
            aria-pressed={pressed}
            aria-label={`${count} ${label}`}
            title={pressed ? `${count} ${label} · Show every thread` : `${count} ${label} · Show only these`}
            onClick={() => onFilter(pressed ? null : id)}
            className={cn(
              LINE_BUTTON,
              pressed ? "bg-sidebar-accent text-sidebar-foreground" : count > 0 ? "text-sidebar-foreground/70" : "text-sidebar-foreground/35",
            )}
          >
            <StillGlyph indicator={FILTER_GLYPH[id]} className={cn(count === 0 && !pressed && "opacity-50")} />
            {count}
          </button>
        );
      })}
      <span aria-hidden className="min-w-0 flex-1" />
      <button
        type="button"
        data-thread-search-open=""
        aria-label="Search threads"
        aria-keyshortcuts="/"
        title="Search threads (/)"
        onClick={onOpenSearch}
        className={cn(LINE_BUTTON, "text-sidebar-foreground/50")}
      >
        <Icon name="Search" aria-hidden className="size-3" />
        <span aria-hidden className={KEY_HINT}>/</span>
      </button>
    </div>
  );
}
