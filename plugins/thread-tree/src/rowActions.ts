import { isWorking, WORKING_INDICATORS, type TreeThread } from "./tree.ts";

/** Compact viewports are touch-first, so their rows are taller. */
export function rowHeightPx(isCompactViewport: boolean): number {
  return isCompactViewport ? 40 : 32;
}

/** Archive and ⋯ are `size-6` buttons. */
export const ROW_ACTION_PX = 24;
export const STRIP_GAP_PX = 2;
export const STRIP_END_PAD_PX = 4;
export const ROW_END_PAD_PX = 8;
export const HOVER_ACTIONS_STRIP_PX = 2 * ROW_ACTION_PX + STRIP_GAP_PX + STRIP_END_PAD_PX;
/** The provider and age slot is at least as wide as the strip, so the buttons only ever cover those labels. */
export const END_SLOT_MIN_PX = HOVER_ACTIONS_STRIP_PX - ROW_END_PAD_PX;

/** A thread stays `stopping` when the machine can't confirm the stop, so Stop stays offered to retry it. */
export function canStop(thread: Pick<TreeThread, "status" | "indicator" | "activity">): boolean {
  return isWorking(thread);
}

/** A parent's glyph is its fold toggle, and a tap on touch must not stop work; both keep Stop in the menus. */
export function stopsFromGlyph(
  thread: Pick<TreeThread, "status" | "indicator" | "activity">,
  row: { glyph: { indicator: string; rowStatus: unknown }; hasChildren: boolean; isCompactViewport: boolean },
): boolean {
  const showsRunning = row.glyph.rowStatus === null && WORKING_INDICATORS.has(row.glyph.indicator);
  return showsRunning && !row.hasChildren && !row.isCompactViewport && canStop(thread);
}

/** Shown at once on hover, keyboard focus or an open menu; only opacity and visibility change, so nothing reflows. */
export function hoverActionsClass(reduceMotion: boolean): string {
  return [
    "pointer-events-none invisible opacity-0",
    reduceMotion ? "transition-none" : "transition-[opacity,visibility] duration-75 ease-out",
    "group-hover/row:visible group-hover/row:opacity-100",
    "group-data-[keyboard-focus]/row:visible group-data-[keyboard-focus]/row:opacity-100",
    "group-data-[menu-open]/row:visible group-data-[menu-open]/row:opacity-100",
  ].join(" ");
}
