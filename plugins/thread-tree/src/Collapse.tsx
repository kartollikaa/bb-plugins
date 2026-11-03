import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** Mounts its children only while open, sliding their height in and out. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const box = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const element = box.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
      { duration: Math.min(300, 160 + Math.abs(target - current) / 4), easing: EASING },
    );
    animation.onfinish = () => {
      element.style.overflow = "";
      if (!open) setMounted(false);
    };
    animation.oncancel = () => {
      element.style.overflow = "";
    };
  }, [open]);

  return mounted ? <div ref={box}>{children}</div> : null;
}
