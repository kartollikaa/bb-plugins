import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

// Radix opens a menu on pointerdown, so a swipe that starts on the trigger opens it; on touch wait for the click.
export function useTapToOpenMenu() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const touchPress = useRef(false);
  const closingPress = useRef<Event | null>(null);

  // An open modal menu disables pointer events on body, so the trigger never gets a second tap and iOS sends no click to <html>.
  useEffect(() => {
    if (!open) return;
    const closeOnTriggerTouch = (event: globalThis.PointerEvent) => {
      const rect = trigger.current?.getBoundingClientRect();
      if (event.pointerType === "mouse" || !rect) return;
      const onTrigger = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!onTrigger) return;
      closingPress.current = event;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnTriggerTouch, true);
    return () => document.removeEventListener("pointerdown", closeOnTriggerTouch, true);
  }, [open]);

  const triggerProps = {
    ref: trigger,
    onPointerDown(event: PointerEvent) {
      touchPress.current = event.pointerType !== "mouse" && event.nativeEvent !== closingPress.current;
      if (event.pointerType !== "mouse") event.preventDefault();
    },
    onClick(_event: MouseEvent) {
      if (!touchPress.current) return;
      touchPress.current = false;
      setOpen((current) => !current);
    },
  };
  return { rootProps: { open, onOpenChange: setOpen }, triggerProps };
}
