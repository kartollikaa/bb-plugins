import { useState } from "react";
import {
  experimental_NewThreadComposer as NewThreadComposer,
  experimental_useRpcQuery as useRpcQuery,
  useBbNavigate,
  useRpc,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/shared";
import { rpcContract } from "@/lib/contract";
import { roleSubPath } from "@/lib/view";

export function ProposePage({ role }: { role: string | null }) {
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const snapshot = useRpcQuery({ contract: rpcContract, method: "snapshot", input: null });
  const proposal = useRpcQuery({ contract: rpcContract, method: "proposal", input: { role } });
  const [failure, setFailure] = useState<string | null>(null);
  const back = () => navigate.toPluginPanel("roles", { subPath: role === null ? "" : roleSubPath(role) });
  const data = proposal.data;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mx-auto box-border w-full max-w-3xl space-y-3 px-4 pb-2 pt-3 md:px-5 md:pt-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={back}>
            ← {role ?? "Roles"}
          </Button>
          <h1 className="text-base font-semibold">Propose a change</h1>
        </div>
        {proposal.error ? (
          <Notice tone="error">{proposal.error.message}</Notice>
        ) : data === undefined ? (
          <Notice>Loading…</Notice>
        ) : (
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <div>
              {role === null ? "All roles" : <>Role <code>{role}</code></>} · team {snapshot.data?.install?.version ?? "?"}
            </div>
            <div className="text-muted-foreground">
              {data.projectName !== null
                ? `A new thread starts in project ${data.projectName} (${data.repo}).`
                : `No bb project for ${data.repo ?? "the team plugin's source repo"}; pick one below.`}
            </div>
          </div>
        )}
        {failure === null ? null : <Notice tone="error">{failure}</Notice>}
      </div>
      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 px-4 pb-4 md:px-5">
        {proposal.isLoading ? null : (
          <NewThreadComposer
            defaultProjectId={data?.projectId ?? undefined}
            placeholder={role === null ? "What should change in the team?" : `What should change in the ${role} role?`}
            draftKey={`team-roles:propose:${role ?? "*"}`}
            focusRequest={1}
            onSubmit={async (request) => {
              setFailure(null);
              try {
                const { brief } = await rpc.call("proposal", { role });
                const thread = await sdk.threads.spawn({
                  ...request,
                  title: role === null ? "team: change the roles" : `team: change the ${role} role`,
                  input: [...request.input, { type: "text", text: brief, mentions: [], visibility: "agent-only" }],
                  pluginMetadata: { teamRole: role, teamVersion: snapshot.data?.install?.version ?? null },
                });
                navigate.toThread(thread.id);
              } catch (cause) {
                setFailure(cause instanceof Error ? cause.message : String(cause));
                throw cause;
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
