/** Mounted sidebars open the next Needs you item, the newest first; the command lives in app.tsx, outside any component. */
type InboxHandler = (threadId: string | null) => boolean;

const handlers: InboxHandler[] = [];

export function setInboxHandler(handler: InboxHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

export function hasInboxHandler(): boolean {
  return handlers.length > 0;
}

export function openNextInboxItem(threadId: string | null): boolean {
  return handlers[handlers.length - 1]?.(threadId) ?? false;
}
