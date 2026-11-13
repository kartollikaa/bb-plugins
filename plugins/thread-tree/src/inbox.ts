/** The mounted sidebar opens the next Needs you item; the command lives in app.tsx, outside any component. */
type InboxHandler = (threadId: string | null) => boolean;

let current: InboxHandler | null = null;

export function setInboxHandler(handler: InboxHandler): () => void {
  current = handler;
  return () => {
    if (current === handler) current = null;
  };
}

export function hasInboxHandler(): boolean {
  return current !== null;
}

export function openNextInboxItem(threadId: string | null): boolean {
  return current?.(threadId) ?? false;
}
