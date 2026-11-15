import type { BbNavigate } from "@get-bb/plugin-sdk/app";

export function openThread(navigate: Pick<BbNavigate, "toThread">, threadId: string, split = false, events: EventTarget = window) {
  const request = new CustomEvent("thread-tree:open-thread", { cancelable: true, detail: { threadId, split } });
  if (events.dispatchEvent(request)) navigate.toThread(threadId, { split });
}
