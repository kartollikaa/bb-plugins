import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import { isStill } from "./motion";
import { placeNear } from "./tree";

/**
 * Drag-to-reorder where the list itself reorders under the pointer while dragging.
 * Items must be direct children of the element given `containerProps`, positioned so `offsetTop` is measured from it.
 */
export function useDragReorder<Id extends string>(order: readonly Id[], commit: (next: Id[]) => void) {
  const [drag, setDrag] = useState<{ id: Id; preview: Id[] } | null>(null);
  const preview = drag?.preview ?? order;
  const draggedBlock = useRef<HTMLElement | null>(null);
  const pin = useRef<Pin | null>(null);
  const isDragging = drag !== null;
  useEffect(() => (isDragging ? autoScrollNearEdges(draggedBlock.current, () => pin.current?.isHolding() ?? false) : undefined), [isDragging]);
  useLayoutEffect(() => {
    if (isDragging) return undefined;
    pin.current?.release();
    pin.current = null;
    return undefined;
  }, [isDragging]);

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
      pin.current?.release();
      pin.current = pinWhileFolding(block, image);
      const preview = [...order];
      // Chrome ends a drag at once if the DOM changes inside dragstart, and blocks fold to headers on drag.
      setTimeout(() => setDrag({ id, preview }), 0);
    },
    "data-reorder-id": id,
    onDrop: drop,
    onDragEnd: () => setTimeout(() => setDrag(null), 0),
  });

  const containerProps = {
    // The pointer's height alone picks the slot, so gaps and the pin's spacer are drop places too.
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!drag) return;
      event.preventDefault();
      const container = event.currentTarget;
      const y = event.clientY - container.getBoundingClientRect().top;
      const others = Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-reorder-id]")).filter(
        (block) => block.dataset.reorderId !== drag.id,
      );
      if (others.length === 0) return;
      const below = others.find((block) => y < block.offsetTop + block.offsetHeight / 2);
      const target = (below ?? others[others.length - 1]!).dataset.reorderId as Id;
      const next = placeNear(drag.preview, drag.id, target, below === undefined);
      if (next.every((entry, index) => entry === drag.preview[index])) return;
      pin.current?.stopHolding();
      setDrag({ id: drag.id, preview: next });
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

type Pin = { isHolding: () => boolean; stopHolding: () => void; release: () => void };

const HOLD_MS = 450;

/**
 * Keeps the grabbed header where it was while the blocks fold for a drag: the scroll container
 * absorbs the shift, and spacers above and below cover what scrolling cannot, until `release`.
 */
function pinWhileFolding(block: HTMLElement, anchor: HTMLElement): Pin {
  const container = block.parentElement;
  const scroller = scrollParent(block);
  const anchorTop = anchor.getBoundingClientRect().top;
  const style = container ? getComputedStyle(container) : null;
  const basePadding = { top: parseFloat(style?.paddingTop ?? "") || 0, bottom: parseFloat(style?.paddingBottom ?? "") || 0 };
  let spacer = 0;
  let bottomSpacer = 0;
  let holding = true;
  const hold = () => {
    if (!holding || !container) return;
    let drift = anchor.getBoundingClientRect().top - anchorTop;
    if (Math.abs(drift) < 0.5) return;
    if (drift > 0 && spacer > 0) {
      const cut = Math.min(spacer, drift);
      spacer -= cut;
      drift -= cut;
    }
    if (scroller && drift !== 0) {
      const before = scroller.scrollTop;
      scroller.scrollTop = before + drift;
      drift -= scroller.scrollTop - before;
    }
    if (drift < 0) spacer -= drift;
    container.style.paddingTop = spacer > 0 ? `${basePadding.top + spacer}px` : "";
    if (drift > 0 && scroller) {
      // Folding shortened the list below a scrolled view; room underneath lets the scroll follow.
      bottomSpacer += drift;
      container.style.paddingBottom = `${basePadding.bottom + bottomSpacer}px`;
      scroller.scrollTop += drift;
    }
  };
  // Fires after layout and before paint, so the header never shows in its shifted place.
  const observer = new ResizeObserver(hold);
  for (const sibling of Array.from(container?.children ?? [])) observer.observe(sibling);
  const stopHolding = () => {
    holding = false;
    observer.disconnect();
    clearTimeout(timer);
  };
  const timer = setTimeout(stopHolding, HOLD_MS);
  return {
    isHolding: () => holding,
    stopHolding,
    release: () => {
      stopHolding();
      if (container) {
        container.style.paddingTop = "";
        container.style.paddingBottom = "";
      }
    },
  };
}

/** Scrolls the block's scroll container while the dragging pointer is near its top or bottom edge. */
function autoScrollNearEdges(block: HTMLElement | null, isPaused: () => boolean): (() => void) | undefined {
  const scroller = scrollParent(block);
  if (!scroller) return undefined;
  let pointer: { x: number; y: number } | null = null;
  let frame = 0;
  const track = (event: globalThis.DragEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  const tick = () => {
    const box = scroller.getBoundingClientRect();
    if (pointer && !isPaused() && pointer.x >= box.left && pointer.x <= box.right) {
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
export function useFlipOrder(container: RefObject<HTMLElement | null>, orderKey: string, reduceMotion: boolean) {
  const tops = useRef(new Map<string, number>());
  const lastOrder = useRef(orderKey);
  const resizes = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    // Blocks also move when a neighbour's height animates; keep their last known place current.
    const observer = new ResizeObserver(() => {
      for (const block of blocksOf(container.current)) tops.current.set(block.dataset.flipKey!, block.offsetTop);
    });
    resizes.current = observer;
    return () => observer.disconnect();
  }, [container]);
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    for (const block of blocksOf(root)) resizes.current?.observe(block);
    const reordered = lastOrder.current !== orderKey;
    lastOrder.current = orderKey;
    const still = isStill(reduceMotion);
    for (const block of blocksOf(root)) {
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

function blocksOf(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-flip-key]")) : [];
}
