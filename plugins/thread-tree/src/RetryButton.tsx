import { useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { failedQueuedMessage } from "./needsYou";

/** Re-submits the failed turn, the same as bb's own Retry in the thread. */
export function RetryButton({ threadId }: { threadId: string }) {
  const sdk = useSdk();
  return (
    <FailurePill
      label="Retry"
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
    <FailurePill
      label="Resend"
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

function FailurePill({ label, ariaLabel, icon, errorTitle, run }: { label: string; ariaLabel: string; icon: string; errorTitle: string; run: () => Promise<unknown> }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async (event) => {
        event.stopPropagation();
        setPending(true);
        try {
          await run();
        } catch (error) {
          toast.error(errorTitle, { description: error instanceof Error ? error.message : String(error) });
        } finally {
          setPending(false);
        }
      }}
      aria-label={ariaLabel}
      className="flex h-5 shrink-0 items-center gap-1 rounded-full border border-destructive/40 px-1.5 text-2xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
    >
      <Icon name={pending ? "Loading" : icon} aria-hidden className="size-3" />
      {label}
    </button>
  );
}
