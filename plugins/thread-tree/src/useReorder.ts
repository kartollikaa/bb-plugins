import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import { placeNear } from "./tree";

/**
 * Drag-to-reorder where the list itself reorders under the pointer while dragging.
 * Items must sit in a positioned container so `offsetTop` is measured from it.
 */
export function useDragReorder<Id extends string>(order: readonly Id[], commit: (next: Id[]) => void) {
  const [drag, setDrag] = useState<{ id: Id; preview: Id[] } | null>(null);
  const preview = drag?.preview ?? order;
  const draggedBlock = useRef<HTMLElement | null>(null);
  const isDragging = drag !== null;
  useEffect(() => (isDragging ? autoScrollNearEdges(draggedBlock.current) : undefined), [isDragging]);

  const drop = useCallback(
    (event: DragEvent) => {
      if (!drag) return;
      event.preventDefault();
      commit(drag.preview);
      setDrag(null);
    },
    [drag, commit],
  );

  const itemProps = (id: Id) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      const block = event.currentTarget;
      if (event.target !== block) {
        // A thread link keeps its own drag; anything else here is a text selection, which would drag page text.
        if (!(event.target instanceof HTMLAnchorElement)) event.preventDefault();
        return;
      }
      window.getSelection()?.removeAllRanges();
      draggedBlock.current = block;
      const image = block.querySelector<HTMLElement>("[data-drag-image]") ?? block;
      const box = image.getBoundingClientRect();
      const clamp = (value: number, size: number) => Math.min(Math.max(value, 0), size);
      event.dataTransfer.setDragImage(image, clamp(event.clientX - box.left, box.width), clamp(event.clientY - box.top, box.height));
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
      const preview = [...order];
      // Chrome ends a drag at once if the DOM changes inside dragstart, and blocks fold to headers on drag.
      setTimeout(() => setDrag({ id, preview }), 0);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!drag) return;
      event.preventDefault();
      if (id === drag.id) return;
      const block = event.currentTarget;
      const containerTop = (block.offsetParent as HTMLElement | null)?.getBoundingClientRect().top ?? 0;
      const after = event.clientY - containerTop > block.offsetTop + block.offsetHeight / 2;
      const next = placeNear(drag.preview, drag.id, id, after);
      if (next.some((entry, index) => entry !== drag.preview[index])) setDrag({ id: drag.id, preview: next });
    },
    onDrop: drop,
    onDragEnd: () => setTimeout(() => setDrag(null), 0),
  });

  const containerProps = {
    onDragOver: (event: DragEvent) => {
      if (drag) event.preventDefault();
    },
    onDrop: drop,
  };

  return { order: preview, draggingId: drag?.id ?? null, isDragging, itemProps, containerProps };
}

const EDGE_PX = 48;
const MAX_SCROLL_PX_PER_FRAME = 14;

function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/** Scrolls the block's scroll container while the dragging pointer is near its top or bottom edge. */
function autoScrollNearEdges(block: HTMLElement | null): (() => void) | undefined {
  const scroller = scrollParent(block);
  if (!scroller) return undefined;
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;
  const track = (event: globalThis.DragEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  const tick = () => {
    const box = scroller.getBoundingClientRect();
    if (pointer && pointer.x >= box.left && pointer.x <= box.right) {
      const edge = Math.min(EDGE_PX, box.height / 4);
      const depth = pointer.y < box.top + edge ? pointer.y - box.top - edge : pointer.y > box.bottom - edge ? pointer.y - box.bottom + edge : 0;
      const strength = Math.max(-1, Math.min(1, depth / edge));
      if (strength !== 0) scroller.scrollTop += Math.round(strength * MAX_SCROLL_PX_PER_FRAME) || Math.sign(strength);
    }
    frame = requestAnimationFrame(tick);
  };
  document.addEventListener("dragover", track);
  frame = requestAnimationFrame(tick);
  return () => {
    document.removeEventListener("dragover", track);
    cancelAnimationFrame(frame);
  };
}

const FLIP_MS = 220;

/**
 * Slides the container's `[data-flip-key]` children from their old place to the new one
 * whenever their order changes; height changes alone do not animate.
 */
export function useFlipOrder(container: RefObject<HTMLElement | null>, orderKey: string) {
  const tops = useRef(new Map<string, number>());
  const lastOrder = useRef(orderKey);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const reordered = lastOrder.current !== orderKey;
    lastOrder.current = orderKey;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const block of Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-flip-key]"))) {
      const key = block.dataset.flipKey!;
      const top = block.offsetTop;
      const previous = tops.current.get(key);
      tops.current.set(key, top);
      if (!reordered || still || previous === undefined) continue;
      const transform = getComputedStyle(block).transform;
      const inFlight = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
      const delta = previous + inFlight - top;
      for (const animation of block.getAnimations()) animation.cancel();
      if (Math.abs(delta) < 1) continue;
      block.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
        duration: FLIP_MS,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
    }
  });
}
