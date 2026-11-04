import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

// Radix opens a menu on pointerdown, so a swipe that starts on the trigger opens it; on touch wait for the click.
export function useTapToOpenMenu() {
  const [open, setOpen] = useState(false);
  const touchPress = useRef(false);
  const triggerProps = {
    onPointerDown(event: PointerEvent) {
      touchPress.current = event.pointerType !== "mouse";
      if (touchPress.current) event.preventDefault();
    },
    onClick(_event: MouseEvent) {
      if (!touchPress.current) return;
      touchPress.current = false;
      setOpen((current) => !current);
    },
  };
  return { rootProps: { open, onOpenChange: setOpen }, triggerProps };
}
