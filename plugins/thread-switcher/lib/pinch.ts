export interface Point {
  x: number;
  y: number;
}

/** Fingers must close to this share of their starting spread, or open by its inverse… */
export const PINCH_RATIO = 0.65;
/** …and travel at least this many CSS pixels together, so a jittery two-finger scroll never counts. */
export const PINCH_MIN_TRAVEL = 60;
/** A page zoomed in past this keeps the pinch for the browser's own zoom-out. */
export const MAX_FREE_SCALE = 1.01;

export function spread(points: readonly Point[]): number | null {
  if (points.length !== 2) return null;
  const [a, b] = points as [Point, Point];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** `in` brings the fingers together (zoom out), `out` spreads them (zoom in). */
export type Pinch = "in" | "out";

export function pinchDirection(start: number, current: number): Pinch | null {
  if (current <= start * PINCH_RATIO && start - current >= PINCH_MIN_TRAVEL) return "in";
  if (current * PINCH_RATIO >= start && current - start >= PINCH_MIN_TRAVEL) return "out";
  return null;
}

/**
 * Follows one two-finger gesture. `move` reports its direction once, when the fingers have moved
 * far enough; a third finger or lifting one ends the gesture without firing.
 */
export class PinchTracker {
  private start: number | null = null;
  private fired = false;

  touch(points: readonly Point[]): void {
    const distance = spread(points);
    if (distance === null) {
      this.start = null;
      if (points.length === 0) this.fired = false;
      return;
    }
    if (this.start === null && !this.fired) this.start = distance;
  }

  move(points: readonly Point[]): Pinch | null {
    const distance = spread(points);
    if (distance === null || this.start === null || this.fired) return null;
    const pinch = pinchDirection(this.start, distance);
    if (!pinch) return null;
    this.fired = true;
    this.start = null;
    return pinch;
  }
}
