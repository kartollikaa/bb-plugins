# Team statistics

A read-only BB page for comparing agent runs by member, provider and model. Open **Team statistics** in the sidebar, choose a project or thread, then **Refresh**. Changing scope clears old results; scans run only on Refresh. Search, time windows and sorting work over the scanned snapshot. Click a member to inspect its runs and open their source threads.

Shows run counts, current running count, completed/failed/stopped counts, reported total and average tokens, tool calls, and mean/median/p95 completed-run timing. Each metric shows its sample coverage; missing values are unavailable, never zero. Running elapsed time is measured at the last refresh. Historical running states reflect the last provider event, and may be stale after an interrupted provider session.

Delegations and linked local-agent background tasks are folded together. Workflow snapshots use call index and attempt; cached replays are excluded. Agent roles and model labels come from provider event presentations or workflow metadata. Providers that omit them appear as Unknown member/model. Workflow execution providers are unavailable and appear as Unknown provider. This does not infer roles from private prompts, read provider transcripts, or attribute a whole parent thread's usage to a child. BB child threads without delegation/workflow telemetry are not individually attributed.

**Cost:** expand Estimated cost and enter your blended USD per million total tokens. Total and average cost are explicitly estimates over reported samples, not billing figures. The SDK events do not provide per-agent billing cost or input/output/cache splits. Filter to a model when applying a rate. The rate is local to the open page and is not stored.

**Scope:** up to 100 threads (active or archived-only, including hidden threads), 2,000 newest matching events per thread, and 5,000 runs. Caps and failed reads are visible. This is a bounded diagnostic snapshot, not an all-time accounting ledger. Run windows use start time; choose All scanned history to include missing starts. History is reconstructed from retained BB events after reload; the plugin does not persist message contents or telemetry copies. No external services are contacted.

CLI: `bb team-stats list [--project <id>] [--thread <id>] [--archived] [--json]`. CLI includes at most 100 run rows within a 48,000-byte JSON bound, with outputTruncated in JSON. No implicit project filter. `--archived` selects archived threads only.

RPC: `scan({projectId: string|null, threadId: string|null, archived: boolean})` and `projects(null)`. Reads serialize to avoid overlapping history sweeps; abort signals stop disconnected/reloaded RPC scans.

Development: `npm install --include=dev`, `npm test`, `npm run typecheck`, `bb plugin build`. Install using the repository plugin index. Unpublished; no marketplace release.
