import { useCallback, useEffect, useState } from "react";
import { experimental_ProviderModelPicker as ProviderModelPicker, experimental_useProviders, useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "../server";
import type { ReviewPickerState, ReviewPickerValue } from "./agentReview";
import { parseReviewModel, REVIEW_REASONING_DEFAULT } from "./pullRequestActions";
import { readReviewSettings } from "./settings";

const segment = "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50";
const segmentOn = `${segment} bg-popover text-popover-foreground shadow-sm`;
const segmentOff = `${segment} text-muted-foreground hover:text-popover-foreground`;

export function ReviewSettingsSection() {
  const rpc = useRpc<typeof rpcContract>();
  const { values, isLoading } = useSettings();
  const { providers } = experimental_useProviders();
  const ready = !isLoading && values !== undefined;
  const { reviewModel, reviewReasoningLevel } = readReviewSettings(values);
  const projectDefault = !reviewModel.trim();
  const ref = parseReviewModel(reviewModel, providers.map((provider) => provider.id));
  const [state, setState] = useState<ReviewPickerState | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => rpc.call("reviewPickerState", null), [rpc]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    load().then(
      (next) => {
        if (cancelled) return;
        setState(next);
        setFailed(false);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [ready, reviewModel, reviewReasoningLevel, load]);

  const save = (selection: ReviewPickerValue | null) =>
    rpc.call("setReviewModel", { selection }).catch((error: unknown) => {
      toast.error(`Couldn't save the Agent review model: ${error instanceof Error ? error.message : String(error)}`);
    });

  const chooseModel = async () => {
    const picker = state?.picker ?? (await load().catch(() => null))?.picker;
    if (!picker) {
      toast.error("No provider lists a model to choose from");
      return;
    }
    await save({ ...picker, reasoningLevel: REVIEW_REASONING_DEFAULT });
  };

  const picker = state?.picker ?? null;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div role="radiogroup" aria-label="Agent review model" className="inline-flex w-fit gap-0.5 rounded-lg border border-border bg-border/40 p-0.5">
        <button type="button" role="radio" aria-checked={projectDefault} disabled={!ready} className={projectDefault ? segmentOn : segmentOff} onClick={() => !projectDefault && void save(null)}>
          Project's default
        </button>
        <button type="button" role="radio" aria-checked={!projectDefault} disabled={!ready} className={!projectDefault ? segmentOn : segmentOff} onClick={() => projectDefault && void chooseModel()}>
          Choose a model
        </button>
      </div>
      {projectDefault && <p className="text-xs text-muted-foreground">Reviews run on each project's default model and reasoning.</p>}
      {!projectDefault && state?.saved === "unavailable" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No available provider offers {reviewModel}, so reviews run on the project's default model. Pick a model below to replace it.
        </p>
      )}
      {!projectDefault && picker && (
        <div className="flex flex-col gap-1.5">
          <ProviderModelPicker
            value={picker}
            onChange={({ providerId, model, reasoningLevel }) => {
              const next = { providerId, model, reasoningLevel };
              setState({ saved: "available", picker: next });
              void save(next);
            }}
          />
          {state?.saved === "available" && ref?.providerId === null && (
            <p className="text-xs text-muted-foreground">Saved as {ref.model} on any provider that offers it; picking a model pins its provider.</p>
          )}
          {state?.saved === "available" && (reviewReasoningLevel === REVIEW_REASONING_DEFAULT ? (
            <p className="text-xs text-muted-foreground">Reasoning: the model's own default level.</p>
          ) : (
            <button type="button" className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-popover-foreground hover:underline" onClick={() => void save({ ...picker, reasoningLevel: REVIEW_REASONING_DEFAULT })}>
              Use the model's own reasoning level
            </button>
          ))}
        </div>
      )}
      {!projectDefault && !picker && (
        <p className="text-xs text-muted-foreground">{failed || state ? "No provider lists models right now; the saved setting stays as it is." : "Loading models…"}</p>
      )}
    </div>
  );
}
