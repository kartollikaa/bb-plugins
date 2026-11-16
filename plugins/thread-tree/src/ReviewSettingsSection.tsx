import { useEffect, useState } from "react";
import { experimental_ProviderModelPicker as ProviderModelPicker, useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "../server";
import { parseReviewModel, REVIEW_REASONING_DEFAULT } from "./pullRequestActions";
import { readReviewSettings } from "./settings";

interface PickerValue {
  providerId: string;
  model: string;
  reasoningLevel: string;
}

/** The saved pair when it names provider, model and level; otherwise the server resolves where the picker opens. */
function savedPickerValue(reviewModel: string, reviewReasoningLevel: string): PickerValue | null {
  const ref = parseReviewModel(reviewModel);
  return ref?.providerId && reviewReasoningLevel !== REVIEW_REASONING_DEFAULT
    ? { providerId: ref.providerId, model: ref.model, reasoningLevel: reviewReasoningLevel }
    : null;
}

export function ReviewSettingsSection() {
  const rpc = useRpc<typeof rpcContract>();
  const { values, isLoading } = useSettings();
  const { reviewModel, reviewReasoningLevel } = readReviewSettings(values);
  const ref = parseReviewModel(reviewModel);
  const projectDefault = ref === null;
  const [value, setValue] = useState<PickerValue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isLoading || projectDefault) return;
    const saved = savedPickerValue(reviewModel, reviewReasoningLevel);
    if (saved) {
      setValue(saved);
      return;
    }
    let cancelled = false;
    rpc.call("reviewPickerSeed", null).then(
      (seed) => {
        if (cancelled) return;
        setFailed(seed === null);
        setValue(seed && reviewReasoningLevel !== REVIEW_REASONING_DEFAULT ? { ...seed, reasoningLevel: reviewReasoningLevel } : seed);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [isLoading, projectDefault, reviewModel, reviewReasoningLevel, rpc]);

  const save = (selection: PickerValue | null) =>
    rpc.call("setReviewModel", { selection }).catch((error: unknown) => {
      toast.error(`Couldn't save the Agent review model: ${error instanceof Error ? error.message : String(error)}`);
    });

  const choose = async (useProjectDefault: boolean) => {
    if (useProjectDefault) return save(null);
    const seed = value ?? (await rpc.call("reviewPickerSeed", null).catch(() => null));
    if (!seed) {
      setFailed(true);
      toast.error("No provider lists a model to choose from");
      return;
    }
    setValue(seed);
    return save(seed);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={projectDefault} disabled={isLoading} onChange={(event) => void choose(event.target.checked)} />
        Use the project's default model and reasoning
      </label>
      {!projectDefault && value && (
        <div className="flex flex-col gap-1">
          <ProviderModelPicker
            value={value}
            onChange={({ providerId, model, reasoningLevel }) => {
              const next = { providerId, model, reasoningLevel };
              setValue(next);
              void save(next);
            }}
          />
          {ref?.providerId === null && (
            <p className="text-xs text-muted-foreground">
              Saved as {ref.model} on any provider that offers it; picking a model pins its provider.
            </p>
          )}
        </div>
      )}
      {!projectDefault && !value && (
        <p className="text-xs text-muted-foreground">{failed ? "No provider lists models right now, so the saved model stays as it is." : "Loading models…"}</p>
      )}
    </div>
  );
}
