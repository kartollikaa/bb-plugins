export interface Point {
  x: number;
  y: number;
}

export const PINCH_RATIO = 0.75;
/** CSS pixels, so a jittery two-finger scroll never counts as a pinch. */
export const PINCH_MIN_TRAVEL = 40;
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

/** Reports one direction per gesture; a third finger or a lifted one ends it unreported. */
export class PinchTracker {
  private start: number | null = null;
  private fired = false;

  /** `fresh` is a touchstart with no other finger already down. */
  touch(points: readonly Point[], fresh = false): void {
    if (fresh || points.length === 0) this.fired = false;
    const distance = spread(points);
    if (distance === null) {
      this.start = null;
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
