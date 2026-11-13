import { isWorking, type TreeThread } from "./tree.ts";

/** Compact viewports are touch-first, so their rows are taller. */
export function rowHeightPx(isCompactViewport: boolean): number {
  return isCompactViewport ? 40 : 32;
}

/** A thread stays `stopping` when the machine can't confirm the stop, so Stop stays offered to retry it. */
export function canStop(thread: Pick<TreeThread, "status" | "indicator" | "activity">): boolean {
  return isWorking(thread);
}

/** A parent row's glyph is its fold toggle, so its Stop lives in the ⋯ menu instead. */
export function stopsFromGlyph(thread: Pick<TreeThread, "status" | "indicator" | "activity">, hasChildren: boolean): boolean {
  return !hasChildren && canStop(thread);
}

/** Shown at once on hover, keyboard focus or an open menu; only opacity and visibility change, so nothing reflows. */
export function hoverActionsClass(reduceMotion: boolean): string {
  return [
    "invisible opacity-0",
    reduceMotion ? "transition-none" : "transition-[opacity,visibility] duration-75 ease-out",
    "group-hover/row:visible group-hover/row:opacity-100",
    "group-data-[keyboard-focus]/row:visible group-data-[keyboard-focus]/row:opacity-100",
    "group-data-[menu-open]/row:visible group-data-[menu-open]/row:opacity-100",
  ].join(" ");
}
