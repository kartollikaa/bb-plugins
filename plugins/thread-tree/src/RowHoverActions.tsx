import { useState, type FocusEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hoverActionsClass, STRIP_END_PAD_PX, STRIP_GAP_PX } from "./rowActions";
import { ROW_FADE_ACTIVE, ROW_FADE_GRADIENT, ROW_FADE_HOVER, ROW_FADE_SOLID } from "./rowStyles";

export interface RowActionsView {
  /** Touch or a compact viewport: the buttons sit in the row, since nothing hovers there. */
  inline: boolean;
  reduceMotion: boolean;
}

/** Labels under the overlay hide while it shows, so a fade never leaves them half visible. */
export const HIDDEN_UNDER_STRIP = "group-hover/row:invisible group-data-[keyboard-focus]/row:invisible";

/** Spread on a `group/row`: keyboard focus inside the row shows its overlay, as hover does. */
export function useRowKeyboardFocus() {
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  return {
    "data-keyboard-focus": keyboardFocus || undefined,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.target)) setKeyboardFocus(event.target.matches(":focus-visible"));
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setKeyboardFocus(false);
    },
  };
}

export function RowHoverActions({ view, isActive, children }: { view: RowActionsView; isActive: boolean; children: ReactNode }) {
  if (view.inline) {
    return (
      <span data-inline-actions="" className="relative z-[1] flex shrink-0 items-center" style={{ gap: STRIP_GAP_PX }}>
        {children}
      </span>
    );
  }
  return (
    <span
      data-hover-actions=""
      className={cn("absolute inset-y-0 right-0 flex items-center rounded-r-md", isActive ? ROW_FADE_ACTIVE : ROW_FADE_HOVER, hoverActionsClass(view.reduceMotion))}
    >
      <span aria-hidden className={cn("h-full w-6", ROW_FADE_GRADIENT)} />
      <span className={cn("flex h-full items-center", ROW_FADE_SOLID)} style={{ gap: STRIP_GAP_PX, paddingRight: STRIP_END_PAD_PX }}>
        {children}
      </span>
    </span>
  );
}
