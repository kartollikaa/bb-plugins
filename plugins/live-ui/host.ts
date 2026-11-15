import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { hostContract, hostSignals } from "./contracts.ts";
import { canonical, readFileSource, dirname } from "./file.ts";
const watches = new Map<
  string,
  {
    until: number;
    timer: ReturnType<typeof setTimeout>;
    dispose: () => Promise<void>;
  }
>();
async function stop(key: string) {
  const w = watches.get(key);
  if (w) {
    watches.delete(key);
    clearTimeout(w.timer);
    await w.dispose();
  }
  return true;
}
export default experimental_defineHostEntry({
  contract: hostContract,
  experimental_signals: hostSignals,
  handlers: {
    status: () => ({ watchers: watches.size }),
    read: ({ root, path }) => readFileSource(root, path),
    stop: ({ key }) => stop(key),
    watch: async ({ key, root, path, until }, ctx) => {
      if (until <= Date.now() || until > Date.now() + 65000)
        throw new Error("Invalid visibility lease");
      const existing = watches.get(key);
      if (existing) {
        existing.until = until;
        return true;
      }
      const target = await canonical(root, path);
      const sub = await ctx.experimental_watch(
        { rootPath: dirname(target), debounceMs: 100, maxWaitMs: 500 },
        async (event) => {
          if (
            event.kind !== "changed" ||
            event.changes.some(
              (c) => c.path === target || c.path === path.split("/").at(-1),
            )
          ) {
            await ctx.experimental_emitSignal("changed", {
              key,
              failed: event.kind === "watch-error",
            });
            if (event.kind === "watch-error") await stop(key);
          }
        },
      );
      const check = () => {
        const w = watches.get(key);
        if (!w) return;
        if (Date.now() >= w.until) {
          void stop(key);
          return;
        }
        w.timer = setTimeout(check, Math.min(1000, w.until - Date.now()));
      };
      watches.set(key, {
        until,
        timer: setTimeout(check, 1000),
        dispose: () => sub.dispose(),
      });
      return true;
    },
  },
  dispose: async () => {
    await Promise.all([...watches.keys()].map(stop));
  },
});
