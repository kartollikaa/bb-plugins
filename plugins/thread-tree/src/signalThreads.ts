import { isWorking, type TreeThread } from "./tree.ts";

type SignalThread = Pick<TreeThread, "id" | "status" | "indicator" | "activity" | "isHidden" | "isArchived">;

/** Threads whose signals the sidebar reads: working ones (step, timer, stuck) and failed ones (rate limit, streak), sorted so the key list stays stable. */
export function signalThreadIds(threads: readonly SignalThread[]): string[] {
  return threads
    .filter((thread) => !thread.isHidden && !thread.isArchived && (isWorking(thread) || thread.status === "error"))
    .map((thread) => thread.id)
    .sort();
}
