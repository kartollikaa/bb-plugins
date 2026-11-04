import { MAX_FREE_SCALE } from "./pinch.ts";

export interface Screen {
  pathname: string;
  threadListOpen: boolean;
  sidePanelOpen: boolean;
  /** A photo, dialog or menu is on top of the page. */
  overlayOpen: boolean;
  /** Page zoom when the gesture started and now. */
  startScale: number;
  scale: number;
}

const THREAD_ROUTE = /^\/projects\/[^/]+\/threads\/[^/]+\/?$/;

export function isThreadRoute(pathname: string): boolean {
  return THREAD_ROUTE.test(pathname);
}

export function pinchCanOpen(screen: Screen): boolean {
  if (screen.startScale > MAX_FREE_SCALE || screen.scale > MAX_FREE_SCALE) return false;
  if (screen.overlayOpen || screen.sidePanelOpen) return false;
  return screen.threadListOpen || isThreadRoute(screen.pathname);
}
