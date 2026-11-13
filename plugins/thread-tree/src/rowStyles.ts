/** Shows a hover-only header control, dimmed, on touch screens where hover never happens. */
export const TOUCH_DIMMED = "[@media(hover:none)]:opacity-60";

/** The hovered row's tint (accent at 60% over the sidebar) as an opaque color, for overlays. */
export const ROW_FADE_HOVER = "[--row-fade:color-mix(in_oklab,var(--sidebar-accent)_60%,var(--sidebar))]";
export const ROW_FADE_ACTIVE = "[--row-fade:var(--sidebar-accent)]";
export const ROW_FADE_GRADIENT = "[background:linear-gradient(to_right,transparent,var(--row-fade))]";
export const ROW_FADE_SOLID = "bg-[var(--row-fade)]";
export const ROW_HOVER_SOLID_BG = `${ROW_FADE_HOVER} ${ROW_FADE_SOLID}`;

/** An inactive row's tint wherever its hover actions show. */
export const ROW_TINT = "hover:bg-sidebar-accent/60 data-[keyboard-focus]:bg-sidebar-accent/60 data-[menu-open]:bg-sidebar-accent/60";

/** A header chevron appears as fast as the row hover controls but folds at bb's usual pace. */
export const HEADER_CHEVRON_MOTION = "[transition:opacity_75ms_ease-out,transform_150ms_cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none";
