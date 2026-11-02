import { experimental_useRpcQuery as useRpcQuery, useBbNavigate, type PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { ArtifactCard } from "@/components/ArtifactCard";
import { rpcContract, type ListView } from "@/lib/contract";
import { findByUrl, urlKey } from "@/lib/lookup";

export function ArtifactDirective({ attributes }: PluginMessageDirectiveProps) {
  const url = (attributes.url ?? "").trim();
  const { data, error, isLoading } = useRpcQuery({ contract: rpcContract, method: "list", input: null });
  const found = data ? findByUrl(data, url) : null;
  if (found) return <ArtifactCard item={found.item} source={found.source} className="not-prose my-2 max-w-sm" />;
  return <Fallback url={url} status={isLoading ? "Loading…" : (error?.message ?? missingReason(data))} />;
}

function missingReason(view: ListView | undefined): string {
  const errors = [view?.claude.error, view?.codex.error].filter(Boolean);
  return errors.length > 0 ? `Couldn't check: ${errors.join("; ")}` : "Not in your published artifacts";
}

function Fallback({ url, status }: { url: string; status: string }) {
  const navigate = useBbNavigate();
  const valid = urlKey(url) !== null;
  return (
    <button
      type="button"
      disabled={!valid}
      title={status}
      onClick={() => navigate.openUrl(url)}
      className="not-prose my-2 flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-card p-3 text-left enabled:hover:bg-accent/40 disabled:opacity-70"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon name="artifacts/sparkles" aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{valid ? url : "No artifact URL"}</span>
        <span className="truncate text-xs text-muted-foreground">{status}</span>
      </span>
    </button>
  );
}
