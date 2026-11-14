export const VIEW_PATH = "orchestrator";

const THREAD_ID = /^thr_[a-z0-9]+$/i;

export const isThreadId = (id: string) => THREAD_ID.test(id);

export function threadFromSubPath(subPath: string): string | null {
  const [first = ""] = subPath.split("/");
  let id: string;
  try {
    id = decodeURIComponent(first);
  } catch {
    return null;
  }
  return isThreadId(id) ? id : null;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type Surface = "view" | "chat";

const key = (threadId: string) => `orchestration.surface.${threadId}`;

/** Remembers, per orchestrator thread, that the owner last picked the full chat over the view. */
export function chatPreference(storage: PreferenceStorage | null) {
  return {
    prefersChat(threadId: string): boolean {
      try {
        return storage?.getItem(key(threadId)) === "chat";
      } catch {
        return false;
      }
    },
    set(threadId: string, surface: Surface): void {
      try {
        if (surface === "chat") storage?.setItem(key(threadId), "chat");
        else storage?.removeItem(key(threadId));
      } catch {
        // A blocked storage only costs the remembered choice.
      }
    },
  };
}

/**
 * `membership` is null until the ledger lookup answers; `decided` is true once this thread view has
 * seen an answer, so a later flip never yanks the owner out of the chat.
 */
export function shouldOpenView({ enabled, membership, prefersChat, inSplit, decided }: { enabled: boolean; membership: boolean | null; prefersChat: boolean; inSplit: boolean; decided: boolean }): boolean {
  return enabled && membership === true && !decided && !prefersChat && !inSplit;
}

export const VIEW_SETTING = "orchestrationView";

export function viewEnabled(values: Record<string, unknown> | undefined): boolean {
  return values?.[VIEW_SETTING] !== false;
}

export const RAIL = { default: 400, min: 340, max: 560, drawerBelow: 900 } as const;

export function railMode(pageWidth: number): RailMode {
  return pageWidth < RAIL.drawerBelow ? "drawer" : "rail";
}

export function clampRailWidth(width: number, pageWidth: number): number {
  if (!Number.isFinite(width)) return RAIL.default;
  const max = Math.max(RAIL.min, Math.min(RAIL.max, Math.floor(pageWidth / 2)));
  return Math.min(max, Math.max(RAIL.min, Math.round(width)));
}

export type RailMode = "rail" | "drawer";
export interface RailChoice {
  key: string;
  open: boolean;
}

export function railOpen(choice: RailChoice | null, key: string, mode: RailMode): boolean {
  return choice?.key === key ? choice.open : mode === "rail";
}

export type ChatPlacement = "rail" | "sheet" | "docked";

/** A folded chat docks its composer under the view, so the composer is never shown twice. */
export function chatPlacement(mode: RailMode, open: boolean): ChatPlacement {
  if (!open) return "docked";
  return mode === "rail" ? "rail" : "sheet";
}

export const DOCK = { fallback: 120 } as const;

export function dockHeight(measured: number | null, pageHeight: number): number {
  const height = measured && Number.isFinite(measured) && measured > 0 ? Math.ceil(measured) : DOCK.fallback;
  return Math.min(height, Math.floor(pageHeight / 2));
}

export const SHEET = { topGap: 48, flick: 0.5, travel: 0.25 } as const;

/** Where a finger's drag on the chat's grabber leaves it: a flick, or a quarter of the way, flips it. */
export function sheetSettles({ wasOpen, dy, velocity, span }: { wasOpen: boolean; dy: number; velocity: number; span: number }): boolean {
  if (Math.abs(velocity) >= SHEET.flick) return velocity < 0;
  const moved = wasOpen ? dy : -dy;
  return moved > Math.max(40, span * SHEET.travel) ? !wasOpen : wasOpen;
}

export function sheetHeightWhileDragging(start: number, dy: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(start - dy)));
}

export const SHEET_SLOP = 8;

/**
 * Who takes a vertical drag inside the chat. Folded, the whole dock drags the sheet. Open, the
 * header and the composer drag it; the transcript scrolls first and hands over at its top.
 */
export function sheetGestureOwner({ open, dx, dy, inHandle, scrollTop }: { open: boolean; dx: number; dy: number; inHandle: boolean; scrollTop: number | null }): "sheet" | "content" | null {
  if (Math.abs(dx) < SHEET_SLOP && Math.abs(dy) < SHEET_SLOP) return null;
  if (Math.abs(dx) > Math.abs(dy)) return "content";
  if (!open || inHandle || scrollTop === null) return "sheet";
  return dy > 0 && scrollTop <= 0 ? "sheet" : "content";
}
