import { useCallback, useMemo } from "react";
import { experimental_useRpcKeyedQuery, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import { threadSignalsSchema, type ThreadSignals } from "./threadSignals";
import { signalThreadIds } from "./signalThreads";

const contract = {
  threadSignals: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(z.string(), threadSignalsSchema.nullable()),
  },
};

/** Signals of the threads that are working or failed; the server refreshes a thread's key when its events move. */
export function useThreadSignals(threads: readonly PluginSidebarThread[]): (threadId: string) => ThreadSignals | undefined {
  const idsKey = signalThreadIds(threads).join();
  const keys = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey]);
  const query = experimental_useRpcKeyedQuery({ contract, method: "threadSignals", keys, enabled: keys.length > 0 });
  const data = query.data;
  return useCallback((threadId: string) => data?.[threadId] ?? undefined, [data]);
}
