import { useCallback, useEffect, useRef, useState } from "react";
import { definePluginApp, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./lib/contract";
import { aggregate, type Run } from "./lib/metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Snapshot = {
  runs: Run[];
  scannedThreads: number;
  partial: boolean;
  failedThreads: number;
  scannedAt: number;
};
const count = (n: number | null) =>
  n === null ? "—" : Math.round(n).toLocaleString();
const duration = (ms: number | null) =>
  ms === null
    ? "—"
    : ms < 1000
      ? `${Math.round(ms)} ms`
      : ms < 60000
        ? `${(ms / 1000).toFixed(1)} s`
        : `${(ms / 60000).toFixed(1)} min`;
function StatsPage() {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProject] = useState("");
  const [threadId, setThread] = useState("");
  const [archived, setArchived] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [days, setDays] = useState("30");
  const [rate, setRate] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState("tokens");
  const generation = useRef(0);
  useEffect(() => {
    rpc
      .call("projects", null)
      .then(setProjects, () => setError("Could not load projects."));
  }, [rpc]);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await rpc.call("scan", {
        projectId: projectId || null,
        threadId: threadId.trim() || null,
        archived,
      });
      if (current === generation.current) setSnapshot(result);
    } catch (cause) {
      if (current === generation.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [rpc, projectId, threadId, archived]);
  useEffect(() => {
    generation.current++;
    setSnapshot(null);
    setSelected(null);
    setLoading(false);
  }, [projectId, threadId, archived]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [rpc]);
  const runs = (snapshot?.runs ?? []).filter(
    (r) =>
      (days === "all" ||
        (r.startedAt !== null &&
          r.startedAt >= Date.now() - Number(days) * 86400000)) &&
      `${r.member} ${r.model} ${r.provider} ${r.label}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const groups = aggregate(runs).sort((a, b) =>
    sort === "tokens"
      ? (b.tokens ?? -1) - (a.tokens ?? -1)
      : sort === "duration"
        ? (b.avgMs ?? -1) - (a.avgMs ?? -1)
        : b.runs - a.runs,
  );
  const known = runs.filter((r) => r.tokens !== null);
  const tokens = known.reduce((n, r) => n + r.tokens!, 0);
  const price =
    rate.trim() !== "" && Number.isFinite(Number(rate)) && Number(rate) >= 0
      ? Number(rate)
      : null;
  const cost = (tokens: number | null) =>
    tokens === null || price === null
      ? "—"
      : `$${((tokens * price) / 1e6).toFixed(4)}`;
  const cell = "px-3 py-2 text-left whitespace-nowrap";
  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div
        className="mx-auto max-w-7xl space-y-4 p-4 md:p-6"
        data-team-stats=""
      >
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-lg font-semibold">Team statistics</h1>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? "Scanning…" : "Refresh"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Agent runs grouped by member, provider and model. Unknown telemetry
          stays unknown. Refresh to update running agents.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            Project
            <select
              aria-label="Project"
              className="mt-1 block rounded-md border border-border bg-background p-2 text-sm"
              value={projectId}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Thread ID (optional)
            <Input
              value={threadId}
              onChange={(e) => setThread(e.target.value)}
              placeholder="Any thread"
              className="mt-1"
            />
          </label>
          <label className="text-xs">
            History
            <select
              aria-label="History"
              className="mt-1 block rounded-md border border-border bg-background p-2 text-sm"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All scanned history</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Archived threads only
          </label>
          <label className="text-xs">
            Search
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Member, model, task…"
              className="mt-1"
            />
          </label>
          <label className="text-xs">
            Sort
            <select
              aria-label="Sort"
              className="mt-1 block rounded-md border border-border bg-background p-2 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="tokens">Total tokens</option>
              <option value="duration">Average duration</option>
              <option value="runs">Run count</option>
            </select>
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {snapshot ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Runs", count(runs.length)],
                [
                  "Running",
                  count(runs.filter((r) => r.state === "running").length),
                ],
                ["Reported tokens", known.length ? count(tokens) : "—"],
                ["Token coverage", `${known.length}/${runs.length} runs`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Scanned {snapshot.scannedThreads} threads ·{" "}
              {new Date(snapshot.scannedAt).toLocaleString()} · Up to 100
              threads, 2,000 matching events per thread and 5,000 runs.{" "}
              {snapshot.partial
                ? "History limit reached; results are partial. "
                : ""}
              {snapshot.failedThreads
                ? `${snapshot.failedThreads} thread reads failed; results are incomplete. `
                : ""}
              Window filters use run start time; runs without a start appear
              only in all scanned history. Cached workflow replays are excluded.
              Workflow execution provider is unavailable.
            </p>
            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer">Estimated cost</summary>
              <label className="mt-3 block max-w-xs text-xs">
                Blended USD per million total tokens
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="Enter your rate"
                  className="mt-1"
                />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                Estimates apply this rate to reported total tokens only. Input,
                output and cache prices differ; this is a debugging estimate,
                not a bill. Actual per-agent billing cost is unavailable from
                these events. Filter to one model for a meaningful comparison.
              </p>
            </details>
            {!groups.length ? (
              <p
                role="status"
                className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground"
              >
                No agent runs match this scope. Try all scanned history or
                choose a thread with delegated agents.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Member usage and timing; averages use reported samples only
                  </caption>
                  <thead className="bg-muted">
                    <tr>
                      {[
                        "Member / model",
                        "Runs",
                        "Running",
                        "Done / failed / stopped",
                        "Tokens",
                        "Avg tokens / run",
                        "Avg / median / p95 time",
                        "Timing samples",
                        "Tools",
                        "Est. total / avg USD",
                      ].map((h) => (
                        <th key={h} className={cell}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr
                        key={g.key}
                        className="border-t border-border hover:bg-muted/50"
                      >
                        <td className={cell}>
                          <button
                            className="text-left underline underline-offset-4"
                            onClick={() =>
                              setSelected(selected === g.key ? null : g.key)
                            }
                          >
                            <span className="font-medium">{g.member}</span>
                            <span className="block text-xs text-muted-foreground">
                              {g.provider} · {g.model}
                            </span>
                          </button>
                        </td>
                        <td className={cell}>{g.runs}</td>
                        <td className={cell}>{g.running}</td>
                        <td className={cell}>
                          {g.completed} / {g.failed} / {g.stopped}
                        </td>
                        <td className={cell}>
                          {count(g.tokens)}
                          <span className="block text-xs text-muted-foreground">
                            {g.tokenSamples}/{g.runs} reported
                          </span>
                        </td>
                        <td className={cell}>{count(g.avgTokens)}</td>
                        <td className={cell}>
                          {duration(g.avgMs)} / {duration(g.medianMs)} /{" "}
                          {duration(g.p95Ms)}
                        </td>
                        <td className={cell}>
                          {g.timedSamples}/{g.runs}
                        </td>
                        <td className={cell}>
                          {count(g.tools)}
                          <span className="block text-xs text-muted-foreground">
                            {g.toolSamples}/{g.runs} reported
                          </span>
                        </td>
                        <td className={cell}>
                          {cost(g.tokens)} / {cost(g.avgTokens)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selected ? (
              <section className="space-y-2">
                <h2 className="font-semibold">Member runs</h2>
                {runs
                  .filter(
                    (r) =>
                      JSON.stringify([r.member, r.provider, r.model]) ===
                      selected,
                  )
                  .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
                  .map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-border p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex-1 font-medium">{r.label}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate.toThread(r.threadId)}
                        >
                          Open thread
                        </Button>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {r.state} · {count(r.tokens)} tokens ·{" "}
                        {duration(
                          r.durationMs ??
                            (r.state === "running" && r.startedAt !== null
                              ? snapshot.scannedAt - r.startedAt
                              : null),
                        )}
                        {r.state === "running" ? " elapsed" : ""} ·{" "}
                        {count(r.tools)} tool calls ·{" "}
                        {r.startedAt === null
                          ? "Start unavailable"
                          : new Date(r.startedAt).toLocaleString()}{" "}
                        · {r.source}
                      </div>
                    </div>
                  ))}
              </section>
            ) : null}
          </>
        ) : loading ? (
          <p role="status">Loading statistics…</p>
        ) : (
          <p role="status">Click Refresh to scan the selected scope.</p>
        )}
      </div>
    </div>
  );
}
export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "statistics",
    title: "Team statistics",
    icon: "ChartNoAxesCombined",
    path: "statistics",
    component: StatsPage,
  });
});
