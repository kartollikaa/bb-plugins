// Turns a ledger snapshot plus bb's live thread state into the tab's one answer: does anything need you, and is the team moving.
import type { Agent, LedgerSummary, Subtask } from "./contract.ts";
import { parseOwnerItem, type Link } from "./owner.ts";

/** Owner's rule: quiet this long while working, or the third failure of a delivery, means stuck. */
export const QUIET_MS = 30 * 60_000;
export const FAILURES_STUCK = 3;

export type RowKind = "you" | "stuck" | "work" | "wait" | "done";

export interface LiveThread {
  status: string;
  hasPendingInteraction: boolean;
  latestAttentionAt: number;
  createdAt: number;
}

export interface Row {
  id: string;
  name: string;
  kind: RowKind;
  step: string;
  age: string;
  runs: string;
  context: string;
  gate: string;
}

export interface Ask {
  key: string;
  who: string;
  age: string;
  since: number | null;
  /** What is asked, when the ledger line says it in the structured format. */
  title: string | null;
  text: string;
  links: Link[];
  threads: string[];
  replies: { label: string; draft: string }[];
  /** question → Answer; decision → Release / Not yet; owner → a «For the owner» line; thread → the answer lives in a thread, not in a message. */
  kind: "question" | "decision" | "owner" | "thread";
  drafts: { primary: string; secondary?: string } | null;
}

export interface View {
  state: "planning" | "done" | "needs" | "stuck" | "moving";
  heading: string;
  subline: string;
  /** The context-card row: the heading, plus the stuck agent when an ask holds the heading. */
  rowLabel: string;
  asks: Ask[];
  nudge: { label: string; draft: string } | null;
  teamLabel: string;
  activeLabel: string;
  active: Row[];
  done: Row[];
  goal: string | null;
  history: { sessions: string; handover: string | null; ledger: string; warnings: string[]; notes: string[] };
}

export interface ViewInput {
  ledger: LedgerSummary;
  agents: Record<string, Agent>;
  live: Record<string, LiveThread>;
  orchestratorThreadId: string;
  now: number;
}

const DONE = new Set(["landed", "verified", "dropped"]);
const ASKING = new Set(["question", "ready", "card"]);
const WAITING = new Set(["waiting-dependency", "planned"]);
const QUIET_WATCHED = new Set(["working", "briefed"]);
const ORDER: Record<RowKind, number> = { you: 0, stuck: 1, work: 2, wait: 3, done: 4 };

export function shortAge(ms: number): string {
  if (ms < 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function longAge(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

export function prettyModel(model: string | null): string | null {
  if (!model) return null;
  const match = /^claude-([a-z]+)-(\d+)-(\d+)\b/.exec(model);
  if (!match) return model;
  return `${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)} ${match[2]}.${match[3]}`;
}

export function firstLine(text: string | null, max = 140): string | null {
  if (!text) return null;
  for (const raw of text.split("\n")) {
    const line = raw
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*(#+|[-*>]|\d+\.)\s*/, "")
      .replace(/[*`]/g, "")
      .replace(/(^|\s)_+(?=\S)|(?<=\S)_+(?=\s|$)/g, "$1")
      .trim();
    if (line) return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
  }
  return null;
}

const listing = (ids: string[]) => (ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const rotations = (n: number) => (n === 0 ? null : n === 1 ? "rotated once" : n === 2 ? "rotated twice" : `rotated ${n} times`);
const capitalize = (text: string) => text[0]!.toUpperCase() + text.slice(1);

interface Classified {
  subtask: Subtask;
  kind: RowKind;
  reason: "quiet" | "circles" | null;
  lastReport: number | null;
  agent: Agent | null;
  live: LiveThread | null;
}

function classify(subtask: Subtask, input: ViewInput): Classified {
  const live = subtask.threadId ? input.live[subtask.threadId] ?? null : null;
  const agent = subtask.threadId ? input.agents[subtask.threadId] ?? null : null;
  const reported = live?.latestAttentionAt || agent?.lastReportAt || live?.createdAt || null;
  const base = { subtask, live, agent, lastReport: reported, reason: null };
  const status = subtask.status ?? "";
  if (DONE.has(status)) return { ...base, kind: "done" };
  if (ASKING.has(status) || live?.hasPendingInteraction) return { ...base, kind: "you" };
  if (subtask.gateFailures >= FAILURES_STUCK) return { ...base, kind: "stuck", reason: "circles" };
  if (QUIET_WATCHED.has(status) && reported !== null && input.now - reported >= QUIET_MS) {
    return { ...base, kind: "stuck", reason: "quiet" };
  }
  if (WAITING.has(status)) return { ...base, kind: "wait" };
  return { ...base, kind: "work" };
}

function stepOf(c: Classified, doneIds: Set<string>, now: number): string {
  const { subtask, agent } = c;
  const said = firstLine(agent?.lastOutput ?? null);
  if (c.reason === "quiet") return `Quiet for ${longAge(now - c.lastReport!)}${said ? ` · last: ${said}` : ""}`;
  if (c.reason === "circles") return `${capitalize(subtask.lastFailedKind ?? "gate")} failed ${subtask.gateFailures} times`;
  switch (subtask.status) {
    case "question": return "Waiting on your answer";
    case "ready": return "Passed the gate, waiting on your word";
    case "card": return "Waiting for you to start its card";
    case "working": return said ?? "Working";
    case "briefed": return "Briefed, no reply yet";
    case "delivered": return "Delivered, waiting for the gate";
    case "gate": return subtask.gateLine ?? "In the gate";
    case "planned": return "Planned, not started";
    case "waiting-dependency": {
      const open = subtask.dependsOn.filter((id) => !doneIds.has(id));
      return open.length ? `Starts after ${listing(open)}` : "Waiting on a dependency";
    }
  }
  if (c.kind === "you") return "Waiting on you in its thread";
  if (c.kind === "done") return firstLine(subtask.statusRaw, 90) ?? capitalize(subtask.status ?? "done");
  return firstLine(subtask.statusRaw, 90) ?? "Status unknown";
}

function toRow(c: Classified, doneIds: Set<string>, now: number): Row {
  const { subtask, agent } = c;
  const model = prettyModel(agent?.model ?? null);
  const runs = model ? [model, agent?.effort].filter(Boolean).join(" · ") : subtask.modelRaw ?? "—";
  const percent = agent?.contextUsed != null && agent.contextWindow ? `${Math.round((agent.contextUsed / agent.contextWindow) * 100)}%` : null;
  const context = [percent, rotations(subtask.rotations)].filter(Boolean).join(" · ") || "—";
  return {
    id: subtask.id,
    name: subtask.name ?? "",
    kind: c.kind,
    step: stepOf(c, doneIds, now),
    age: c.kind === "wait" || c.lastReport === null ? "" : shortAge(now - c.lastReport),
    runs,
    context,
    gate: subtask.gateLine ?? "Not at a gate yet",
  };
}

function askOf(c: Classified, now: number): Ask {
  const { subtask, agent } = c;
  const who = subtask.name ? `${subtask.id} · ${subtask.name}` : subtask.id;
  const since = c.lastReport;
  const base = { key: subtask.id, who, since, age: since === null ? "" : shortAge(now - since), title: null, links: [], threads: [], replies: [] };
  if (subtask.status === "ready") {
    return {
      ...base,
      kind: "decision",
      text: `${subtask.id} passed the gate and waits for your word to land.`,
      drafts: { primary: `${subtask.id}: go ahead and land it.`, secondary: `${subtask.id}: not yet, hold the landing.` },
    };
  }
  if (subtask.status === "card") {
    return { ...base, kind: "thread", text: `${subtask.id} waits for you to start its card in this chat.`, drafts: null };
  }
  if (subtask.status !== "question" && c.live?.hasPendingInteraction) {
    return { ...base, kind: "thread", text: `${subtask.id} waits on an approval or a question in its thread.`, drafts: null };
  }
  const text = agent?.lastOutput?.trim() || `${subtask.id} asked a question. It is in its thread.`;
  return { ...base, kind: "question", text, drafts: { primary: `Re ${subtask.id}: ` } };
}

export function buildView(input: ViewInput): View {
  const { ledger, now } = input;
  const classified = ledger.subtasks.map((s) => classify(s, input));
  const doneIds = new Set(classified.filter((c) => c.kind === "done").map((c) => c.subtask.id));
  const rows = classified.map((c) => toRow(c, doneIds, now));
  const total = rows.length;
  const doneCount = doneIds.size;
  const progress = `${doneCount} of ${total} done`;

  const asks = classified.filter((c) => c.kind === "you").map((c) => askOf(c, now));
  const orchestrator = input.live[input.orchestratorThreadId];
  if (orchestrator?.hasPendingInteraction) {
    asks.push({
      key: "orchestrator",
      who: "Orchestrator",
      since: orchestrator.latestAttentionAt || null,
      age: orchestrator.latestAttentionAt ? shortAge(now - orchestrator.latestAttentionAt) : "",
      title: null,
      text: "The orchestrator waits on an approval or a question in this chat.",
      links: [],
      threads: [],
      replies: [],
      kind: "thread",
      drafts: null,
    });
  }
  const notes: string[] = [];
  ledger.forTheOwner.forEach((line, i) => {
    const item = parseOwnerItem(line);
    if (item.kind === "note") {
      notes.push(item.text);
      return;
    }
    const base = { key: `owner-${i}`, who: "For you, from the ledger", since: null, age: "", kind: "owner" as const, links: item.links, threads: item.threads };
    if (item.kind === "ask") {
      const re = `Re «${item.title}»: `;
      asks.push({ ...base, title: item.title, text: item.why ?? "", drafts: { primary: re }, replies: item.options.map((label) => ({ label, draft: `${re}${label}` })) });
    } else {
      asks.push({ ...base, title: null, text: item.text, drafts: { primary: `Re «${firstLine(item.text, 60)}»: ` }, replies: [] });
    }
  });
  asks.sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity));

  const active = rows.filter((r) => r.kind !== "done" && r.kind !== "you");
  const stuck = classified.filter((c) => c.kind === "stuck")
    .sort((a, b) => (a.reason === b.reason ? (a.lastReport ?? 0) - (b.lastReport ?? 0) : a.reason === "circles" ? -1 : 1));
  active.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || stuck.findIndex((c) => c.subtask.id === a.id) - stuck.findIndex((c) => c.subtask.id === b.id));
  const working = rows.filter((r) => r.kind === "work");
  const done = rows.filter((r) => r.kind === "done");

  const lastHandover = ledger.lastHandover;
  const history = {
    sessions: ledger.orchestratorSessions === 1
      ? "This is the first orchestrator session."
      : `This is orchestrator session ${ledger.orchestratorSessions}. The team above includes subtasks from all ${ledger.orchestratorSessions}.`,
    handover: lastHandover?.why ?? null,
    ledger: ledger.path,
    warnings: ledger.warnings,
    notes,
  };
  const common = { asks, active, done, goal: ledger.goal, history, activeLabel: `${active.length} active`, teamLabel: asks.length ? "Rest of the team" : "Team" };

  if (total === 0) {
    return { ...common, state: "planning", heading: "Planning the work", subline: "The orchestrator is splitting the goal into subtasks.", rowLabel: "Planning the work", nudge: null };
  }

  const head = stuck[0];
  const stuckId = head?.subtask.id;
  const failedKind = head?.subtask.lastFailedKind ?? "the gate";
  const quiet = head && head.reason !== "circles" ? longAge(now - head.lastReport!) : "";
  const stuckNote = head ? `${stuckId} ${head.reason === "circles" ? "is going in circles" : "has gone quiet"}` : null;
  const stuckNudge = head
    ? head.reason === "circles"
      ? { label: `Ask the orchestrator about ${stuckId}`, draft: `${stuckId} has failed ${failedKind} ${head.subtask.gateFailures} times. What's the plan?` }
      : { label: `Ask the orchestrator about ${stuckId}`, draft: `What is ${stuckId} doing? It hasn't reported for ${quiet}.` }
    : null;
  const more = stuck.length > 1 ? ` ${plural(stuck.length - 1, "other agent looks", "other agents look")} stuck too.` : "";

  if (asks.length) {
    const first = asks[0]!;
    const heading = asks.length > 1 ? `${asks.length} things need you`
      : first.kind === "decision" ? "One decision for you" : first.kind === "owner" ? "One thing waits on you" : "One question for you";
    if (stuckNote) {
      const note = stuck.length > 1 ? `${stuckNote}, ${plural(stuck.length - 1, "other", "others")} stuck too` : stuckNote;
      return { ...common, state: "needs", heading, subline: `${capitalize(note)} · ${progress}`, rowLabel: `${heading} · ${note}`, nudge: stuckNudge };
    }
    const subline = working.length ? `The rest of the team is moving · ${progress}` : progress;
    return { ...common, state: "needs", heading, subline, rowLabel: heading, nudge: null };
  }

  if (ledger.status === "closed" || doneCount === total) {
    const heading = doneCount === total ? (total === 1 ? "The only subtask is done" : `All ${total} subtasks are done`) : "The orchestration is closed";
    return {
      ...common,
      state: "done",
      heading,
      subline: ledger.status === "closed" ? (doneCount === total ? "The ledger is closed." : `The ledger is closed · ${progress}`) : "The orchestrator is wrapping up.",
      rowLabel: heading,
      nudge: null,
    };
  }

  if (head) {
    const heading = `Nothing needs you, but ${stuckNote}`;
    if (head.reason === "circles") {
      return { ...common, state: "stuck", heading, subline: `${capitalize(failedKind)} failed ${head.subtask.gateFailures} times.${more}`, rowLabel: heading, nudge: stuckNudge };
    }
    const others = classified.filter((c) => c.kind === "work" && c.lastReport !== null).map((c) => now - c.lastReport!);
    const othersLine = others.length ? ` Everyone else reported in the last ${longAge(Math.max(...others))}.` : "";
    return { ...common, state: "stuck", heading, subline: `No report from ${stuckId} for ${quiet}.${stuck.length > 1 ? more : othersLine}`, rowLabel: heading, nudge: stuckNudge };
  }

  const reports = classified.filter((c) => c.kind !== "done" && c.lastReport !== null).map((c) => c.lastReport!);
  const latest = reports.length ? ` · latest report ${shortAge(now - Math.max(...reports)) === "now" ? "just now" : `${shortAge(now - Math.max(...reports))} ago`}` : "";
  const waiting = rows.filter((r) => r.kind === "wait").length;
  const lead = working.length ? `${plural(working.length, "agent", "agents")} working` : `${waiting} waiting`;
  return { ...common, state: "moving", heading: "Nothing needs you", subline: `${lead} · ${progress}${latest}`, rowLabel: "Nothing needs you", nudge: null };
}

/** What a «sent» marker sticks to: a new question, decision or ledger line under the same key is a new ask. */
export function askIdentity(ask: Ask): string {
  return [ask.key, ask.kind, ask.since ?? "", ask.title ?? "", ask.text].join("\u0000");
}
