import { useCallback, useMemo } from "react";
import { experimental_useRpcKeyedQuery, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import { diffStatEnvironmentOf, diffStatOf, formatDiffStat, GIT_PLUGIN_ID } from "./diffStat";
import { threadItemKind } from "./needsYou";

const contract = {
  status: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(z.string(), z.unknown()),
  },
};

/** Results to review on their own worktree, read through bb's Git plugin, which refreshes a row when its files change. */
export function useDiffStats(threads: readonly PluginSidebarThread[], descendantIdsOf: (threadId: string) => readonly string[]): (threadId: string) => string | null {
  const pairsKey = JSON.stringify(
    threads
      .filter((thread) => threadItemKind(thread) === "unread")
      .flatMap((thread) => {
        const environmentId = diffStatEnvironmentOf(thread, threads, descendantIdsOf);
        return environmentId ? [[thread.id, environmentId]] : [];
      })
      .sort(),
  );
  const environmentOf = useMemo(() => new Map<string, string>(JSON.parse(pairsKey)), [pairsKey]);
  const keys = useMemo(() => [...new Set(environmentOf.values())].sort(), [environmentOf]);
  const query = experimental_useRpcKeyedQuery({ pluginId: GIT_PLUGIN_ID, contract, method: "status", keys, enabled: keys.length > 0 });
  const data = query.data;
  return useCallback((threadId: string) => {
    const environmentId = environmentOf.get(threadId);
    const stat = environmentId ? diffStatOf(data?.[environmentId]) : null;
    return stat ? formatDiffStat(stat) : null;
  }, [environmentOf, data]);
}
