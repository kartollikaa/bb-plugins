import { useState } from "react";
import { Markdown, experimental_copyToClipboard, experimental_useRpcQuery as useRpcQuery, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { CHIP, CopyText, Notice } from "@/components/shared";
import { cn } from "@/lib/utils";
import { rpcContract } from "@/lib/contract";
import type { RoleRow } from "@/lib/schema";
import { accessParts, INSTALL_COMMAND, proposeSubPath, roleDetailState, runtimeKeys, runtimeLabel } from "@/lib/view";

function Prompt({ name, runtimes }: { name: string; runtimes: string[] }) {
  const [runtime, setRuntime] = useState(runtimes[0] ?? "");
  const [raw, setRaw] = useState(false);
  const { data, isLoading, error } = useRpcQuery({ contract: rpcContract, method: "prompt", input: { name, runtime } });
  const text = data?.prompt ?? null;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">Prompt</h2>
        {runtimes.map((key) => (
          <Button key={key} size="sm" variant={key === runtime ? "secondary" : "ghost"} onClick={() => setRuntime(key)}>
            {runtimeLabel(key)}
          </Button>
        ))}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setRaw(!raw)}>
          {raw ? "Rendered" : "Raw"}
        </Button>
        <Button size="sm" variant="outline" disabled={text === null} onClick={() => void experimental_copyToClipboard({ text: text ?? "" })}>
          Copy
        </Button>
      </div>
      {data?.differsFromTable.length ? <Notice tone="error">Differs from the source table: {data.differsFromTable.join(", ")}</Notice> : null}
      {isLoading ? (
        <Notice>Loading the prompt…</Notice>
      ) : error !== null && error !== undefined ? (
        <Notice tone="error">{error.message}</Notice>
      ) : data?.error ? (
        <Notice tone="error">unknown: {data.error}</Notice>
      ) : text !== null && raw ? (
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-3 text-xs">{text}</pre>
      ) : text !== null ? (
        <div className="max-h-[32rem] overflow-auto rounded-lg border border-border bg-card p-3 text-sm">
          <Markdown content={text} />
        </div>
      ) : null}
    </section>
  );
}

function Files({ role, root, hostId }: { role: RoleRow & { generatedFiles: string[] }; root: string; hostId: string | null }) {
  const navigate = useBbNavigate();
  async function open(relative: string) {
    const path = `${root}/${relative}`;
    const opened = hostId === null ? false : await navigate.experimental_openFilePreview({ target: { kind: "host", hostId, path }, location: null });
    if (!opened) await experimental_copyToClipboard({ text: path });
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-muted-foreground">Files</span>
      {[role.source, ...role.generatedFiles].map((file, index) => (
        <button key={file} type="button" className="cursor-pointer font-mono underline-offset-2 hover:underline" onClick={() => void open(file)}>
          {file}
          {index === 0 ? " (source)" : ""}
        </button>
      ))}
    </div>
  );
}

export function RoleDetail({ name }: { name: string }) {
  const navigate = useBbNavigate();
  const snapshot = useRpcQuery({ contract: rpcContract, method: "snapshot", input: null });
  const role = useRpcQuery({ contract: rpcContract, method: "role", input: { name } });
  const back = () => navigate.toPluginPanel("roles", { subPath: "" });
  const state = roleDetailState(snapshot.data, role.data, role.isLoading);
  const row = state.kind === "ok" ? state.role : undefined;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-4xl space-y-4 px-4 pb-4 pt-3 md:px-5 md:pt-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={back}>
            ← Roles
          </Button>
          <h1 className="min-w-0 flex-1 text-base font-semibold">{name}</h1>
          <Button size="sm" onClick={() => navigate.toPluginPanel("roles", { subPath: proposeSubPath(name) })}>
            Propose a change
          </Button>
        </div>
        {state.kind === "loading" ? (
          <Notice>Loading…</Notice>
        ) : state.kind === "not-installed" ? (
          <Notice>
            <p className="mb-2">The team plugin isn't installed for Claude Code{state.installError === null ? "" : ` (${state.installError})`}.</p>
            <CopyText text={INSTALL_COMMAND} />
          </Notice>
        ) : state.kind === "roles-error" ? (
          <Notice tone="error">{state.message}</Notice>
        ) : state.kind === "not-found" ? (
          <Notice>
            No role <code>{name}</code> in team {state.version}.{" "}
            <button type="button" className="cursor-pointer underline" onClick={back}>
              Back to the list
            </button>
          </Notice>
        ) : row === undefined ? null : (
          <>
            <p className="text-sm">{row.intent}</p>
            <div className="flex flex-wrap gap-1.5">
              <span className={CHIP}>tier {row.tier}</span>
              <span className={CHIP}>effort {row.effort}</span>
              <span className={CHIP}>{accessParts(row).join(" · ")}</span>
              {row.web ? null : <span className={CHIP}>no web</span>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2" />
                    {runtimeKeys([row]).map((key) => (
                      <th key={key} className="px-3 py-2 font-medium">
                        {runtimeLabel(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Agent", (r) => r.agent],
                      ["Model", (r) => r.model],
                      ["Effort", (r) => r.effort],
                      ["Blocked tools", (r) => (r.disallowed_tools.length === 0 ? "—" : r.disallowed_tools.join(", "))],
                      ["Features", (r) => (Object.keys(r.features).length === 0 ? "—" : Object.entries(r.features).map(([k, v]) => `${k}: ${v}`).join(", "))],
                    ] as [string, (r: RoleRow["runtimes"][string]) => string][]
                  ).map(([label, value]) => (
                    <tr key={label} className="border-t border-border align-top">
                      <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-normal text-muted-foreground">{label}</th>
                      {runtimeKeys([row]).map((key) => (
                        <td key={key} className="px-3 py-2">
                          {row.runtimes[key] === undefined ? "—" : value(row.runtimes[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-border align-top">
                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-normal text-muted-foreground">Not enforced (prompt only)</th>
                    {runtimeKeys([row]).map((key) => {
                      const items = row.runtimes[key]?.unenforced ?? [];
                      return (
                        <td key={key} className={cn("px-3 py-2", items.length === 0 && "text-muted-foreground")}>
                          {items.length === 0 ? (
                            "—"
                          ) : (
                            <ul className="list-disc space-y-1 pl-4">
                              {items.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            {snapshot.data?.install ? <Files role={row} root={snapshot.data.install.root} hostId={snapshot.data.hostId} /> : null}
            <Prompt name={name} runtimes={runtimeKeys([row])} />
          </>
        )}
      </div>
    </div>
  );
}
