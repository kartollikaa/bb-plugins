import { useSyncExternalStore } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { failedQueuedMessage } from "./needsYou";
import { createPendingActions } from "./pendingActions";

const pendingActions = createPendingActions();

/** Re-submits the failed turn, the same as bb's own Retry in the thread. */
export function RetryButton({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  return (
    <ActionPill
      label="Retry"
      pendingKey={`retry:${threadId}`}
      ariaLabel="Retry the failed turn"
      icon="RotateCcw"
      errorTitle="Retry failed"
      run={() => sdk.threads.retry({ threadId })}
    />
  );
}

/** Sends the thread's failed queued message again, the same as bb's Send now on it. */
export function ResendButton({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  return (
    <ActionPill
      label="Resend"
      pendingKey={`resend:${threadId}`}
      ariaLabel="Resend the failed queued message"
      icon="Send"
      errorTitle="Resend failed"
      run={async () => {
        const failed = failedQueuedMessage(await sdk.threads.queuedMessages.list({ threadId }));
        if (!failed) throw new Error("The thread has no failed queued message.");
        await sdk.threads.queuedMessages.send({ threadId, queuedMessageId: failed.id, mode: "auto" });
      }}
    />
  );
}

/** Ends a stuck thread's turn, the same as Stop on its glyph. */
export function StopButton({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  return (
    <ActionPill
      label="Stop"
      pendingKey={`stop:${threadId}`}
      ariaLabel="Stop the stuck turn"
      icon="Square"
      errorTitle="Stop failed"
      tone="neutral"
      run={() => stopThread(sdk, threadId)}
    />
  );
}

/** bb's Stop with a toast on failure; the row glyph, its menu and the stuck item share it. */
export async function stopThread(sdk: ReturnType<typeof useSdk>, threadId: string) {
  try {
    await sdk.threads.stop({ threadId });
  } catch (error) {
    toast.error("Stop failed", { description: error instanceof Error ? error.message : String(error) });
  }
}

const PILL_TONE = {
  danger: "border-destructive/40 text-destructive hover:bg-destructive/10",
  neutral: "border-sidebar-foreground/25 text-sidebar-foreground/80 hover:bg-sidebar-foreground/10",
} as const;

/** Runs `run` once at a time per key, with a toast on failure; pills and icon buttons share the pending state. */
export async function runPending(pendingKey: string, errorTitle: string, run: () => Promise<unknown>) {
  const release = pendingActions.begin(pendingKey);
  if (!release) return;
  try {
    await run();
  } catch (error) {
    toast.error(errorTitle, { description: error instanceof Error ? error.message : String(error) });
  } finally {
    release();
  }
}

export function usePending(pendingKey: string): boolean {
  return useSyncExternalStore(pendingActions.subscribe, () => pendingActions.has(pendingKey));
}

export function ActionPill({ label, pendingKey, ariaLabel, icon, errorTitle, confirm, run, tone = "danger" }: { label: string; pendingKey: string; ariaLabel: string; icon: string; errorTitle: string; confirm?: () => Promise<boolean>; run: () => Promise<unknown>; tone?: keyof typeof PILL_TONE }) {
  const pending = usePending(pendingKey);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async (event) => {
        event.stopPropagation();
        if (confirm && !(await confirm())) return;
        await runPending(pendingKey, errorTitle, run);
      }}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-2xs font-medium disabled:opacity-60 ${PILL_TONE[tone]}`}
    >
      <Icon name={pending ? "Loading" : icon} fallback="Play" aria-hidden className="size-3" />
      {label}
    </button>
  );
}
