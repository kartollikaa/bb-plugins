import { useState } from "react";
import { experimental_useRpcQuery as useRpcQuery, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { ArtifactCard } from "@/components/ArtifactCard";
import { rpcContract, type SourceList } from "@/lib/contract";
import type { Source } from "@/lib/lookup";
import { matches } from "@/lib/filter";

export function ArtifactsPage() {
  const { data, error, isLoading } = useRpcQuery({ contract: rpcContract, method: "list", input: null });
  const rpc = useRpc<typeof rpcContract>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refresh = () => {
    setIsRefreshing(true);
    setRefreshError(null);
    rpc
      .call("refresh", null)
      .catch((cause: unknown) => setRefreshError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setIsRefreshing(false));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-6">
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title"
            aria-label="Filter artifacts by title"
            className="flex-1"
          />
          <Button variant="ghost" size="icon" onClick={refresh} disabled={isRefreshing} aria-label="Refresh">
            <Icon name="artifacts/refresh" aria-hidden className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </div>
        {error || refreshError ? <p className="text-sm text-destructive">{refreshError ?? error?.message}</p> : null}
        {isLoading && !data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {data ? (
          <>
            <Section title="Claude Code artifacts" gallery="https://claude.ai/code/artifacts" list={data.claude} query={query} source="claude" />
            <Section title="Codex Sites" gallery={null} list={data.codex} query={query} source="codex" />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, gallery, list, query, source }: { title: string; gallery: string | null; list: SourceList; query: string; source: Source }) {
  const navigate = useBbNavigate();
  const items = list.items.filter((item) => matches(item, query));
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{list.items.length}</span>
        </h2>
        {gallery ? (
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => navigate.openUrl(gallery)}>
            Open gallery
          </button>
        ) : null}
      </div>
      {list.error ? <p className="text-sm text-destructive">{list.error}</p> : null}
      {items.length === 0 && !list.error ? (
        <p className="text-sm text-muted-foreground">{query ? "Nothing matches." : "Nothing published yet."}</p>
      ) : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {items.map((item) => (
          <li key={item.id}>
            <ArtifactCard item={item} source={source} />
          </li>
        ))}
      </ul>
    </section>
  );
}
