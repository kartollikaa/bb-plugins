import { isWorking, type TreeThread } from "./tree.ts";

/** Compact viewports are touch-first, so their rows are taller. */
export function rowHeightPx(isCompactViewport: boolean): number {
  return isCompactViewport ? 40 : 32;
}

/** Work Stop would end; a thread already stopping keeps its spinner. */
export function canStop(thread: Pick<TreeThread, "status" | "indicator" | "activity">): boolean {
  return thread.status !== "stopping" && isWorking(thread);
}

/** A parent row's glyph is its fold toggle, so its Stop lives in the ⋯ menu instead. */
export function stopsFromGlyph(thread: Pick<TreeThread, "status" | "indicator" | "activity">, hasChildren: boolean): boolean {
  return !hasChildren && canStop(thread);
}

/**
 * The right-end overlay: hidden at rest, shown after the hover delay, at once for keyboard focus
 * or an open menu. Only opacity and visibility change, so nothing in the row reflows.
 */
export function hoverActionsClass(reduceMotion: boolean): string {
  return [
    "invisible opacity-0",
    reduceMotion ? "transition-[visibility] duration-0" : "transition-[opacity,visibility] duration-100 ease-out",
    "group-hover/row:visible group-hover/row:opacity-100 group-hover/row:delay-[120ms]",
    "group-data-[keyboard-focus]/row:visible group-data-[keyboard-focus]/row:opacity-100 group-data-[keyboard-focus]/row:delay-0",
    "group-data-[menu-open]/row:visible group-data-[menu-open]/row:opacity-100 group-data-[menu-open]/row:delay-0",
  ].join(" ");
}
