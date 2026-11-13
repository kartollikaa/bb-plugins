/** The hovered row's tint (accent at 60% over the sidebar) as an opaque color, for overlays. */
export const ROW_HOVER_SOLID_BG = "bg-[color-mix(in_oklab,var(--sidebar-accent)_60%,var(--sidebar))]";

/** Shows a hover-only header control, dimmed, on touch screens where hover never happens. */
export const TOUCH_DIMMED = "[@media(hover:none)]:opacity-60";

/** The hover-actions overlay paints the row's own tint: a fade, then solid behind the buttons. */
export const ROW_FADE_HOVER = "[--row-fade:color-mix(in_oklab,var(--sidebar-accent)_60%,var(--sidebar))]";
export const ROW_FADE_ACTIVE = "[--row-fade:var(--sidebar-accent)]";
export const ROW_FADE_GRADIENT = "[background:linear-gradient(to_right,transparent,var(--row-fade))]";
export const ROW_FADE_SOLID = "bg-[var(--row-fade)]";
