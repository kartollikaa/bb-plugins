import type { RefObject } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { StillGlyph } from "./ThreadGlyph";
import { FILTER_GLYPH } from "./statusGlyph";
import { STATUS_FILTERS, statusSummary, type CloseReason, type StatusFilter, type StatusFilterCounts } from "./statusFilters";

const LINE_BUTTON =
  "flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-2xs tabular-nums outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-1 focus-visible:ring-sidebar-ring";
const FIELD =
  "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 text-sm outline-none transition-colors motion-reduce:transition-none";
const KEY_HINT = "ml-auto shrink-0 rounded border border-sidebar-border bg-sidebar px-1.5 font-sans text-[11px] leading-4 text-sidebar-foreground/60";

/** A full-width search field: closed it is a button that looks like the input it opens into, in the same place. */
export function SearchField({
  open,
  query,
  onQuery,
  onOpen,
  onClose,
  inputRef,
}: {
  open: boolean;
  query: string;
  onQuery: (query: string) => void;
  onOpen: () => void;
  onClose: (reason: CloseReason) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  if (open) {
    return (
      <div role="search" className={cn(FIELD, "border-sidebar-ring bg-sidebar text-sidebar-foreground/70 ring-2 ring-sidebar-ring/30")}>
        <Icon name="Search" aria-hidden className="size-4 shrink-0" />
        <input
          ref={inputRef}
          autoFocus
          data-thread-search=""
          type="text"
          value={query}
          aria-label="Search threads by title, branch, PR number or project"
          placeholder="Search threads"
          title="Matches title, branch, PR number (#123) and project"
          onChange={(event) => onQuery(event.target.value)}
          onBlur={() => {
            if (query.trim() === "") onClose("blur");
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            onClose("action");
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sidebar-foreground outline-none placeholder:text-sidebar-foreground/60"
        />
        <span aria-hidden className={KEY_HINT}>esc</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      data-thread-search-open=""
      aria-label="Search threads"
      aria-keyshortcuts="/"
      title="Search title, branch, PR number (#123) and project (/)"
      onClick={onOpen}
      className={cn(
        FIELD,
        "border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground/60 hover:border-sidebar-ring/60 hover:bg-sidebar-accent hover:text-sidebar-foreground/80 focus-visible:border-sidebar-ring focus-visible:ring-2 focus-visible:ring-sidebar-ring/30",
      )}
    >
      <Icon name="Search" aria-hidden className="size-4 shrink-0" />
      <span className="truncate">Search threads</span>
      <span aria-hidden className={KEY_HINT}>/</span>
    </button>
  );
}

/** The four counts are filter toggles for flat lists of those threads. */
export function StatusLine({
  counts,
  filter,
  onFilter,
}: {
  counts: StatusFilterCounts;
  filter: StatusFilter | null;
  onFilter: (filter: StatusFilter | null) => void;
}) {
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
    </div>
  );
}
