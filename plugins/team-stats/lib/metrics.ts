export interface EventRow {
  seq: number;
  type: string;
  createdAt: number;
  data: unknown;
}
export interface Run {
  id: string;
  threadId: string;
  projectId: string;
  provider: string;
  member: string;
  model: string;
  label: string;
  state: string;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  tokens: number | null;
  tools: number | null;
  source: string;
}
const record = (x: unknown): Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const text = (x: unknown, fallback: string) =>
  typeof x === "string" && x.trim() ? x.trim().slice(0, 240) : fallback;
const number = (x: unknown): number | null =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
function state(x: unknown) {
  if (["completed", "done"].includes(String(x))) return "completed";
  if (["error", "failed"].includes(String(x))) return "failed";
  if (["interrupted", "killed", "stopped"].includes(String(x)))
    return "stopped";
  if (x === "skipped") return "skipped";
  if (x === "queued" || x === "pending") return "queued";
  return "running";
}
export function foldRuns(
  rows: readonly EventRow[],
  thread: { id: string; projectId: string; providerId: string },
): Run[] {
  const runs = new Map<string, Run>();
  const owners = new Map<string, string>();
  const background = new Set<string>();
  const make = (id: string, source: string): Run => ({
    id: `${thread.id}:${id}`,
    threadId: thread.id,
    projectId: thread.projectId,
    provider: thread.providerId,
    member: "Unknown member",
    model: "Unknown model",
    label: "Agent",
    state: "running",
    startedAt: null,
    endedAt: null,
    durationMs: null,
    tokens: null,
    tools: null,
    source,
  });
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    const item = record(record(row.data).item);
    if (typeof item.id !== "string") continue;
    if (item.type === "delegation") {
      const run = runs.get(item.id) ?? make(item.id, "delegation");
      const presentation = record(item.presentation);
      const detail = text(presentation.detail, "");
      if (detail) {
        run.member = detail.split(/\s+·\s+/)[0].replace(/\s+agent$/i, "");
        run.model =
          detail.match(/(?:^|·)\s*model\s+([^·]+)/i)?.[1]?.trim() ?? run.model;
      }
      run.label = text(item.label, text(presentation.title, run.label));
      if (row.type === "item/started") run.startedAt ??= row.createdAt;
      else if (row.type.endsWith("completed") && !background.has(item.id)) {
        if (item.background === true && item.status === "completed")
          run.state = "unknown";
        else {
          run.state = state(item.status);
          run.endedAt = row.createdAt;
        }
      }
      runs.set(item.id, run);
    }
    if (item.type !== "backgroundTask") continue;
    const workflow = record(item.workflow);
    if (Array.isArray(workflow.agents)) {
      for (const raw of workflow.agents) {
        const agent = record(raw);
        if (typeof agent.index !== "number" || agent.cached === true) continue;
        const key = `workflow:${item.id}:${agent.index}:${agent.attempt ?? 0}`;
        const run = runs.get(key) ?? make(key, "workflow");
        run.provider = "Unknown provider";
        run.member = text(agent.agentType, "Unknown member");
        run.model = text(agent.model, "Unknown model");
        run.label = text(agent.label, "Workflow agent");
        run.state = state(agent.state);
        run.startedAt = number(agent.startedAt);
        run.durationMs = number(agent.durationMs);
        run.endedAt =
          run.startedAt !== null && run.durationMs !== null
            ? run.startedAt + run.durationMs
            : null;
        run.tokens = number(agent.tokens);
        run.tools = number(agent.toolCalls);
        runs.set(key, run);
      }
      continue;
    }
    if (item.taskType !== "local_agent") continue;
    const owner =
      typeof item.parentToolCallId === "string"
        ? item.parentToolCallId
        : owners.get(item.id);
    if (!owner) continue;
    owners.set(item.id, owner);
    background.add(owner);
    const run = runs.get(owner) ?? make(owner, "background task");
    const usage = record(item.usage);
    run.tokens = number(usage.totalTokens) ?? run.tokens;
    run.tools = number(usage.toolUses) ?? run.tools;
    run.durationMs = number(usage.durationMs) ?? run.durationMs;
    run.state = state(item.taskStatus);
    if (["completed", "failed", "stopped"].includes(run.state))
      run.endedAt = row.createdAt;
    else run.endedAt = null;
    runs.set(owner, run);
  }
  return [...runs.values()].map((run) => ({
    ...run,
    durationMs:
      run.durationMs ??
      (run.startedAt !== null && run.endedAt !== null
        ? Math.max(0, run.endedAt - run.startedAt)
        : null),
  }));
}
export function aggregate(runs: Run[]) {
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const key = JSON.stringify([run.member, run.provider, run.model]);
    const group = groups.get(key);
    if (group) group.push(run);
    else groups.set(key, [run]);
  }
  return [...groups.entries()].map(([key, values]) => {
    const timed = values
      .filter((r) => ["completed", "failed", "stopped"].includes(r.state))
      .flatMap((r) => (r.durationMs === null ? [] : [r.durationMs]))
      .sort((a, b) => a - b);
    const tokens = values.flatMap((r) => (r.tokens === null ? [] : [r.tokens]));
    const tools = values.flatMap((r) => (r.tools === null ? [] : [r.tools]));
    const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const percentile = (p: number) =>
      timed.length ? timed[Math.max(0, Math.ceil(timed.length * p) - 1)] : null;
    return {
      key,
      member: values[0].member,
      provider: values[0].provider,
      model: values[0].model,
      runs: values.length,
      running: values.filter((r) => r.state === "running").length,
      completed: values.filter((r) => r.state === "completed").length,
      failed: values.filter((r) => r.state === "failed").length,
      stopped: values.filter((r) => r.state === "stopped").length,
      tokenSamples: tokens.length,
      tokens: tokens.length ? total(tokens) : null,
      avgTokens: tokens.length ? total(tokens) / tokens.length : null,
      toolSamples: tools.length,
      tools: tools.length ? total(tools) : null,
      timedSamples: timed.length,
      totalMs: timed.length ? total(timed) : null,
      avgMs: timed.length ? total(timed) / timed.length : null,
      medianMs: percentile(0.5),
      p95Ms: percentile(0.95),
    };
  });
}
