import { useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_useRpcQuery,
  useRpc,
  useRealtimeConnectionState,
  type ExperimentalCodeFenceRendererProps,
} from "@get-bb/plugin-sdk/app";
import { rpcContract } from "./contracts.ts";
import {
  configSchema,
  type Binding,
  type Report,
  type Config,
} from "./schema.ts";
import "./style.css";
export function ReportView({
  report,
  view,
}: {
  report: Report;
  view: Config["view"];
}) {
  if (view === "Metric")
    return (
      <div className="live-ui-metrics">
        {report.metrics?.map((m, i) => (
          <div key={i}>
            <div>{m.label}</div>
            <strong>{String(m.value ?? "—")}</strong>
          </div>
        )) ?? "No metrics in report"}
      </div>
    );
  if (view === "Table")
    return report.table ? (
      <div className="live-ui-scroll" tabIndex={0} aria-label="Report table">
        <table>
          <thead>
            <tr>
              {report.table.columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.table.rows.map((r, i) => (
              <tr key={i}>
                {report.table!.columns.map((_, j) => (
                  <td key={j}>{String(r[j] ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p>No table in report</p>
    );
  if (view === "Chart") {
    const max = Math.max(
      1,
      ...(report.chart ?? []).map((x) => Math.abs(x.value)),
    );
    return (
      <ul className="live-ui-chart">
        {report.chart?.map((p, i) => (
          <li key={i}>
            <span>{p.label}</span>
            <meter aria-label={p.label} min={-max} max={max} value={p.value} />
            <span>{p.value}</span>
          </li>
        )) ?? "No chart in report"}
      </ul>
    );
  }
  return (
    <ol className="live-ui-pipeline">
      {report.pipeline?.map((p, i) => (
        <li key={i}>
          <span>{p.label}</span>
          <strong data-state={p.status}>{p.status}</strong>
        </li>
      )) ?? "No pipeline in report"}
    </ol>
  );
}
function Block({ binding }: { binding: Binding }) {
  const rpc = useRpc<typeof rpcContract>();
  const query = experimental_useRpcQuery({
    contract: rpcContract,
    method: "snapshot",
    input: binding,
  });
  const [client] = useState(() => crypto.randomUUID());
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [visible, setVisible] = useState(false);
  const box = useRef<HTMLElement>(null),
    enabled = useRef(false);
  const connection = useRealtimeConnectionState();
  const send = async (
    action: "mount" | "resume" | "pause" | "heartbeat" | "refresh",
  ) => {
    try {
      const result = await rpc.call("control", { binding, client, action });
      if (action === "mount") enabled.current = result.live;
      setError("");
    } catch {
      enabled.current = false;
      setError("Source unavailable or access revoked. Refresh to retry.");
    }
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let intersects = false;
    const visibility = () => {
      const next = intersects && document.visibilityState === "visible";
      setVisible(next);
      if (next) void send("mount");
      if (!next) {
        enabled.current = false;
        void send("pause");
      }
    };
    const observer = new IntersectionObserver((entries) => {
      intersects = entries.some((e) => e.isIntersecting);
      visibility();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      enabled.current = false;
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      void send("pause");
    };
  }, [binding, client]);
  useEffect(() => {
    if (connection !== "connected") {
      enabled.current = false;
      void send("pause");
    }
  }, [connection]);
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      if (enabled.current) void send("heartbeat");
    }, 15000);
    return () => clearInterval(timer);
  }, [visible, binding, client]);
  const data = query.data;
  useEffect(() => {
    if (data && !data.live) enabled.current = false;
  }, [data?.live]);
  const action = async (a: "resume" | "pause" | "refresh") => {
    setPending(true);
    if (a === "resume") enabled.current = true;
    if (a === "pause") enabled.current = false;
    await send(a);
    await query.refetch();
    setPending(false);
  };
  const protectedError = Boolean(error || query.error || data?.revoked);
  const effectiveLive = Boolean(data?.live && !protectedError);
  return (
    <section
      className="live-ui"
      ref={box}
      aria-label={binding.config.title ?? "Live report"}
    >
      <header>
        <strong>{binding.config.title ?? binding.config.view}</strong>
        <span role="status">
          {effectiveLive ? "Live" : "Paused"}
          {data?.expiresAt && Date.now() >= data.expiresAt ? " · expired" : ""}
        </span>
      </header>
      <p className="live-ui-source">
        {binding.config.source.root}/{binding.config.source.path}
      </p>
      {data ? (
        <p className="live-ui-meta">
          Source host: {JSON.parse(data.identity).hostId} · environment:{" "}
          {JSON.parse(data.identity).environmentId ?? "thread storage"}
        </p>
      ) : null}
      <div className="live-ui-controls">
        <button
          disabled={pending || !visible || connection !== "connected"}
          onClick={() => void action(effectiveLive ? "pause" : "resume")}
        >
          {effectiveLive ? "Pause" : "Resume Live"}
        </button>
        <button disabled={pending} onClick={() => void action("refresh")}>
          Refresh
        </button>
      </div>
      <p className="live-ui-meta">
        Live duration: {data?.durationMinutes ?? 10} min · visibility lease:{" "}
        {data?.leaseSeconds ?? 45}s · hiding pauses; Resume required
      </p>
      {effectiveLive && data?.expiresAt ? (
        <p className="live-ui-meta">
          Expires {new Date(data.expiresAt).toLocaleTimeString()}
        </p>
      ) : null}
      {error || query.error || data?.error ? (
        <p role="alert">
          {error ||
            (query.error ? "Cannot validate source access" : data?.error)}
          {!protectedError && data?.report
            ? " · stale; showing last successful read"
            : ""}
        </p>
      ) : null}
      {!protectedError && data?.report ? (
        <ReportView report={data.report} view={binding.config.view} />
      ) : (
        <p>
          {query.isLoading
            ? "Reading report…"
            : "No accessible snapshot. Use Refresh."}
        </p>
      )}
      <footer>
        {data?.readAt && !protectedError ? (
          <>
            Last successful read: {new Date(data.readAt).toLocaleString()} ·
            revision {data.revision}
          </>
        ) : (
          "No successful read"
        )}{" "}
        · Current status; pin evidence separately
      </footer>
    </section>
  );
}
export function Fence(props: ExperimentalCodeFenceRendererProps) {
  let config: Config;
  try {
    if (props.status !== "closed" || props.code.length > 4096)
      throw new Error();
    config = configSchema.parse(JSON.parse(props.code));
  } catch {
    return (
      <>
        <p>Live UI: complete, valid JSON is required.</p>
        <props.Original />
      </>
    );
  }
  const key = JSON.stringify([
    props.message.threadId,
    props.message.id,
    props.index,
    config,
  ]);
  return (
    <Bound
      key={key}
      threadId={props.message.threadId}
      messageId={props.message.id}
      index={props.index}
      config={config}
    />
  );
}
function Bound(binding: Binding) {
  const [stable] = useState(binding);
  return <Block binding={stable} />;
}
export default definePluginApp((app) => {
  app.slots.experimental_codeFenceRenderer({
    id: "report",
    languages: ["live-ui"],
    component: Fence,
  });
});
