import { useState } from "react";
import { experimental_useRpcQuery as useRpcQuery, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { CopyText, CHIP, Notice } from "@/components/shared";
import { cn } from "@/lib/utils";
import { rpcContract } from "@/lib/contract";
import type { Snapshot } from "@/lib/schema";
import {
  accessParts,
  codexText,
  generatedText,
  INSTALL_COMMAND,
  installLine,
  modelEffort,
  proposeSubPath,
  roleSubPath,
  runtimeKeys,
  runtimeLabel,
} from "@/lib/view";


function StatusLine({ label, ok, text, children }: { label: string; ok: boolean | null; text: string; children?: React.ReactNode }) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className={cn(ok === true && "text-foreground", ok === false && "text-destructive", ok === null && "text-muted-foreground")}>
        {ok === true ? "✓ " : ""}
        {text}
      </span>
      {children}
    </div>
  );
}

function Details({ lines, title }: { lines: string[]; title: string }) {
  if (lines.length === 0) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer">{title}</summary>
      <ul className="mt-1 space-y-0.5 font-mono">
        {lines.map((line, index) => (
          <li key={`${index}:${line}`} className="break-all">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Header({ snapshot }: { snapshot: Snapshot }) {
  const { install, generated, codex } = snapshot;
  if (install === null) return null;
  return (
    <div className="space-y-1">
      <div className="text-sm">{installLine(install)}</div>
      <div className="break-all font-mono text-xs text-muted-foreground">{install.root}</div>
      {install.others.length > 0 ? <div className="text-xs text-muted-foreground">also installed: {install.others.join(", ")}</div> : null}
      <StatusLine label="Generated files" ok={generated.state === "current" ? true : generated.state === "unknown" ? null : false} text={generatedText(generated)} />
      <Details title="Problems" lines={[...generated.problems, ...generated.other]} />
      <StatusLine
        label="Codex agents"
        ok={codex.state === "installed" ? true : codex.state === "unknown" ? null : false}
        text={`${codexText(codex)}${codex.dest === null ? "" : ` — ${codex.dest}`}`}
      />
      <Details title="Codex details" lines={[...codex.problems, ...codex.steps.filter((step) => step.action !== "unchanged").map((step) => `${step.action} ${step.file}`), ...codex.other]} />
      {codex.applyCommand === null ? null : (
        <div className="pt-1">
          <div className="mb-1 text-xs text-muted-foreground">To apply, run it yourself:</div>
          <CopyText text={codex.applyCommand} />
        </div>
      )}
    </div>
  );
}

export function RoleList({ selected, compact }: { selected: string | null; compact: boolean }) {
  const { data, isLoading, error } = useRpcQuery({ contract: rpcContract, method: "snapshot", input: null });
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setFailure(null);
    try {
      await rpc.call("refresh", null);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  }

  const keys = data === undefined ? [] : runtimeKeys(data.roles);
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-4xl space-y-4 px-4 pb-4 pt-3 md:px-5 md:pt-4">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 text-base font-semibold">Team roles</h1>
          <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate.toPluginPanel("roles", { subPath: proposeSubPath(null) })}>
            Propose a change
          </Button>
        </div>
        {failure ?? error?.message ? <Notice tone="error">{failure ?? error?.message}</Notice> : null}
        {isLoading || data === undefined ? (
          <Notice>Loading roles…</Notice>
        ) : data.install === null ? (
          <Notice>
            <p className="mb-2">The team plugin isn't installed for Claude Code{data.installError === null ? "" : ` (${data.installError})`}.</p>
            <CopyText text={INSTALL_COMMAND} />
          </Notice>
        ) : (
          <>
            {compact ? null : <Header snapshot={data} />}
            {data.rolesError === null ? (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {data.roles.map((role) => (
                  <li key={role.name}>
                    <button
                      type="button"
                      className={cn("block w-full cursor-pointer px-3 py-2 text-left hover:bg-muted/50", selected === role.name && "bg-muted")}
                      onClick={() => navigate.toPluginPanel("roles", { subPath: roleSubPath(role.name) })}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium">{role.name}</span>
                        {compact
                          ? null
                          : keys.map((key) => (
                              <span key={key} className="text-muted-foreground" title={runtimeLabel(key)}>
                                {runtimeLabel(key)}: {modelEffort(role, key, " · ")}
                              </span>
                            ))}
                        <span className={CHIP}>{accessParts(role).join(" · ")}</span>
                      </div>
                      {compact ? null : <div className="mt-0.5 text-xs text-muted-foreground">{role.intent}</div>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Notice tone="error">{data.rolesError}</Notice>
            )}
            <div className="text-xs text-muted-foreground">checked {new Date(data.checkedAt).toLocaleTimeString()}</div>
          </>
        )}
      </div>
    </div>
  );
}
