import { createContext, useContext } from "react";

/** The plugin's Reduce motion setting; the system preference also stops motion. */
export const ReduceMotionContext = createContext(false);

export function useStill(): boolean {
  return useContext(ReduceMotionContext);
}

export function isStill(setting: boolean): boolean {
  return setting || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
