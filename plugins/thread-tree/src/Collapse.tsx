import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isStill, useStill } from "./motion";

const EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** Mounts its children only while open, sliding their height in and out. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const box = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const reduceMotion = useStill();

  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const element = box.current;
    if (!element) return;
    if (isStill(reduceMotion)) {
      if (!open) setMounted(false);
      return;
    }
    const running = element.getAnimations();
    const current = running.length > 0 ? element.getBoundingClientRect().height : open ? 0 : element.scrollHeight;
    for (const animation of running) animation.cancel();
    const target = open ? element.scrollHeight : 0;
    element.style.overflow = "hidden";
    const animation = element.animate(
      [
        { height: `${current}px`, opacity: open ? 0.4 : 1 },
        { height: `${target}px`, opacity: open ? 1 : 0 },
      ],
      // Closing holds its last frame: the contents would flash at full height before they unmount.
      { duration: Math.min(300, 160 + Math.abs(target - current) / 4), easing: EASING, fill: open ? "none" : "forwards" },
    );
    animation.onfinish = () => {
      // Unclipped for even one frame, the rows' top margin pushes everything below down 2px.
      if (!open) setMounted(false);
      else element.style.overflow = "";
    };
    animation.oncancel = () => {
      element.style.overflow = "";
    };
  }, [open]);

  return mounted ? <div ref={box}>{children}</div> : null;
}
