// Turns a ledger snapshot plus bb's live thread state into the tab's one answer: does anything need you, and is the team moving.
import type { Agent, LedgerSummary, Pending, Subtask, ThreadActivity } from "./contract.ts";
import type { Answer } from "./answered.ts";
import { parseOwnerItem, type Link } from "./owner.ts";
import { replyDraft, replyPrefix } from "./reply.ts";
import { orchestrationPhase, type Phase } from "./phase.ts";
import { shortAge, stepAge } from "./age.ts";
import { REPORT_HEADER, firstLine, reportGist, shortName, spokenText, statusNote } from "./text.ts";
import { buildSections, naming, type Naming, type Sections } from "./sections.ts";
import { capitalize } from "./human.ts";

export { shortAge, REPORT_HEADER, firstLine, reportGist, shortName };

/** Owner's rule: quiet this long while working, or the third failure of a delivery, means stuck. */
export const QUIET_MS = 30 * 60_000;
export const FAILURES_STUCK = 3;
/** The Now block is possibly out of date when the orchestrator's last turn started this long after its `updated`. */
export const STALE_GRACE_MS = 10 * 60_000;
/** From this many free-text «For the owner» lines on an active ledger they fold into one card. */
export const FREE_TEXT_GROUP_FROM = 6;

export type RowKind = "you" | "stuck" | "work" | "wait" | "done";

export interface LiveThread {
  status: string;
  hasPendingInteraction: boolean;
  latestAttentionAt: number;
  createdAt: number;
  parentThreadId?: string | null;
  title?: string | null;
  hidden?: boolean;
  /** What the thread's pending interaction asks, once read; null while unknown. */
  pending?: Pending | null;
  /** Background commands and provider agents running in the thread, from bb's sidebar. */
  backgroundCommands?: number;
  backgroundAgents?: number;
}

export interface Row {
  id: string;
  /** What the row shows before its name: the subtask id, or the id a child's title ends with. */
  label: string;
  name: string;
  kind: RowKind;
  /** bb has a turn running in the row's thread. */
  running: boolean;
  step: string;
  /** The step is bb's live tool step, shown as-is. */
  stepLive: boolean;
  age: string;
  /** The status cell as written, and the last report's header kind and gist with its age; «—» when there is none. */
  status: string;
  lastReport: string;
  runs: string;
  context: string;
  gate: string;
}

export interface Ask {
  key: string;
  who: string;
  /** The subtask a «For the owner» line names first (`ask: T2: …`); its thread opens from the card. */
  subtask: string | null;
  age: string;
  since: number | null;
  /** What is asked, when the ledger line says it in the structured format, without its subtask id. */
  title: string | null;
  /** The title as the ledger writes it: replies quote it and the sent-marker keys on it. */
  replyTitle: string | null;
  text: string;
  links: Link[];
  threads: string[];
  replies: { label: string; draft: string }[];
  /** question → Answer; decision → Release / Not yet; owner → a «For the owner» line; thread → the answer lives in a thread, not in a message. */
  kind: "question" | "decision" | "owner" | "thread";
  drafts: { primary: string; secondary?: string } | null;
  answered: Answer | null;
  /** The line is a wait on the owner written as free text instead of `ask:`. */
  freeText?: boolean;
  /** A grouped card: the free-text lines folded under it, each its own ask with its own answer. */
  group?: Ask[];
}

export interface RecapLine {
  text: string;
  age: string;
}

export interface NowWait {
  who: string;
  label: string;
  subtask: string | null;
  what: string;
  age: string;
  kind: "subtask" | "owner" | "background" | "other";
  since?: string | null;
}

export interface NowView {
  source: "block" | "text" | "none";
  orchestrator: { state: "running" | "asking" | "idle" | "unknown"; age: string; activity: string | null; background: number };
  lastTurn: RecapLine | null;
  doing: string | null;
  waits: NowWait[];
  /** The orchestrator asked in its last message, but its ledger records no ask. */
  mismatch: boolean;
  next: string | null;
  blockedBy: string | null;
  lastDecision: RecapLine | null;
  /** `label` is the header text: «updated 6m ago», «ledger written 3m ago», the date, and the stale mark. */
  updated: { age: string; stale: boolean; from: "block" | "ledger" | null; label: string };
  /** The checkpoint as written. */
  text: string | null;
}

export interface View {
  phase: Phase;
  state: "planning" | "done" | "needs" | "stuck" | "moving";
  recap: { goal: string | null };
  now: NowView;
  /** Status line, Working now, Next, Plan, Recently and Details: what the Now section shows. */
  sections: Sections;
  /** The context-card row: the status line's word and sentence. */
  rowLabel: string;
  asks: Ask[];
  /** Ledger asks the owner answered; they wait on the orchestrator, not on the owner. */
  answered: Ask[];
  /** The stuck part the owner can ask the orchestrator about. */
  nudge: { label: string; draft: string; text: string } | null;
  active: Row[];
  done: Row[];
  /** Row or ask key → the bb thread its Open thread button opens. */
  threadIds: Record<string, string>;
  history: { sessions: string; handover: string | null; ledger: string; warnings: string[]; notes: string[]; freeTextNotes: string[] };
}

export interface ViewInput {
  ledger: LedgerSummary;
  agents: Record<string, Agent>;
  live: Record<string, LiveThread>;
  orchestratorThreadId: string;
  now: number;
  answered?: Record<string, Answer>;
  /** What each running thread's turn is doing, by thread id; null or missing when unreadable. */
  activity?: Record<string, ThreadActivity | null>;
  /** The orchestrator's last output and the ledger file's modification time. */
  report?: { text: string } | null;
  ledgerModifiedAt?: number | null;
  /** Child thread id → its brief, the first message the orchestrator sent it. */
  briefs?: Record<string, string>;
}

const DONE = new Set(["landed", "verified", "dropped"]);
const ASKING = new Set(["question", "ready", "card"]);
const WAITING = new Set(["waiting-dependency", "planned"]);
const QUIET_WATCHED = new Set(["working", "briefed"]);
const BUSY = new Set(["starting", "active", "stopping"]);
const isBusy = (live: LiveThread | null | undefined) => !!live && BUSY.has(live.status);
const ORDER: Record<RowKind, number> = { you: 0, stuck: 1, work: 2, wait: 3, done: 4 };

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


const listing = (ids: string[]) => (ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const rotations = (n: number) => (n === 0 ? null : n === 1 ? "rotated once" : n === 2 ? "rotated twice" : `rotated ${n} times`);

export interface Classified {
  subtask: Subtask;
  /** A child thread of the orchestrator that no ledger row names: shown while it runs or asks. */
  child: { label: string; name: string } | null;
  kind: RowKind;
  reason: "quiet" | "circles" | "blocked" | null;
  lastReport: number | null;
  agent: Agent | null;
  live: LiveThread | null;
  activity: ThreadActivity | null;
}

/** Since when a thread has said nothing: an idle thread since its last report; a running turn is never quiet. */
export function quietSince(live: LiveThread | null, reported: number | null): number | null {
  return isBusy(live) ? null : reported;
}

function classify(subtask: Subtask, input: ViewInput): Classified {
  const live = subtask.threadId ? input.live[subtask.threadId] ?? null : null;
  const agent = subtask.threadId ? input.agents[subtask.threadId] ?? null : null;
  const reported = live?.latestAttentionAt || agent?.lastReportAt || live?.createdAt || null;
  const activity = subtask.threadId ? input.activity?.[subtask.threadId] ?? null : null;
  const base = { subtask, child: null, live, agent, activity, lastReport: reported, reason: null };
  const silentSince = quietSince(live, reported);
  const status = subtask.status ?? "";
  if (live?.hasPendingInteraction) return { ...base, kind: "you" };
  if (DONE.has(status)) return { ...base, kind: isBusy(live) ? "work" : "done" };
  if (ASKING.has(status)) return { ...base, kind: "you" };
  if (subtask.gateFailures >= FAILURES_STUCK) return { ...base, kind: "stuck", reason: "circles" };
  if (status === "blocked") return { ...base, kind: "stuck", reason: "blocked" };
  if (QUIET_WATCHED.has(status) && silentSince !== null && input.now - silentSince >= QUIET_MS && agent?.archivedAt == null) {
    return { ...base, lastReport: silentSince, kind: "stuck", reason: "quiet" };
  }
  if (WAITING.has(status)) return { ...base, kind: "wait" };
  return { ...base, kind: "work" };
}

function stepIsLive(c: Classified): boolean {
  if (c.child) return c.kind !== "you" && !!c.activity;
  if (c.kind === "work" && DONE.has(c.subtask.status ?? "")) return false;
  return !c.reason && c.kind !== "you" && isBusy(c.live);
}

function stepOf(c: Classified, doneIds: Set<string>, now: number, nameIsNote: boolean): string {
  const { subtask, agent } = c;
  const said = firstLine(agent?.lastOutput ?? null);
  if (c.child) return c.kind === "you" ? "Waiting on you in its thread" : c.activity ? liveStep(c.activity, now) : "Running, not in the ledger yet";
  if (c.kind === "work" && DONE.has(subtask.status ?? "")) return `Running again · ${firstLine(subtask.statusRaw, 90) ?? subtask.status}`;
  if (c.reason === "quiet") return `Quiet for ${longAge(now - c.lastReport!)}${said ? ` · last: ${said}` : ""}`;
  if (c.reason === "circles") return `${capitalize(subtask.lastFailedKind ?? "gate")} failed ${subtask.gateFailures} times`;
  if (c.reason === "blocked") return blockedLine(subtask);
  if (c.kind !== "you" && isBusy(c.live)) return liveStep(c.activity, now);
  const note = nameIsNote ? null : statusNote(subtask);
  if ((subtask.status === "working" || subtask.status === "briefed") && note) return capitalize(note);
  switch (subtask.status) {
    case "question": return "Waiting on your answer";
    case "ready": {
      const note = statusNote(subtask);
      return note ? capitalize(note) : "Passed the gate, waiting on your word";
    }
    case "card": return "Waiting for you to start its card";
    case "working": return reportGist(agent?.lastOutput ?? null)?.gist || said || "Working";
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

/** What a running turn is doing: its step with the step's age, else the turn's age; without activity only that it runs. */
function liveStep(activity: ThreadActivity | null, now: number): string {
  if (activity?.step && activity.stepStartedAt !== null) return `${activity.step} · ${stepAge(now - activity.stepStartedAt)}`;
  if (activity?.turnStartedAt != null) return `Turn running ${stepAge(now - activity.turnStartedAt)}`;
  return "Turn running";
}




/** «blocked — no access to the registry» → «Blocked: no access to the registry». */
function blockedLine(subtask: Subtask): string {
  const note = statusNote(subtask);
  return note ? `Blocked: ${note}` : "Blocked";
}

const STUCK_ORDER = { circles: 0, blocked: 1, quiet: 2 } as const;

/** What the row is called: the id cell's name or delivery, else the status note; the id alone when there is nothing. */
function nameOf(c: Classified): { name: string; label: string; isNote: boolean } {
  const { subtask } = c;
  if (c.child) return { name: c.child.name, label: c.child.label, isNote: false };
  const named = shortName(subtask.name);
  if (named) return { name: named, label: subtask.id, isNote: false };
  const note = shortName(statusNote(subtask));
  if (note) return { name: note, label: subtask.id, isNote: true };
  return { name: subtask.id, label: "", isNote: false };
}

function lastReportLine(c: Classified, now: number): string {
  const text = c.agent?.lastOutput ?? null;
  const parsed = reportGist(text);
  const said = parsed ? `${parsed.kind}${parsed.gist ? `: ${parsed.gist}` : ""}` : firstLine(text, 120);
  if (!said) return "—";
  return c.lastReport === null ? said : `${said} · ${shortAge(now - c.lastReport)}`;
}

function toRow(c: Classified, doneIds: Set<string>, now: number): Row {
  const { subtask, agent } = c;
  const model = prettyModel(agent?.model ?? null);
  const runs = model ? [model, agent?.effort].filter(Boolean).join(" · ") : subtask.modelRaw ?? "—";
  const percent = agent?.contextUsed != null && agent.contextWindow ? `${Math.round((agent.contextUsed / agent.contextWindow) * 100)}%` : null;
  const context = [percent, rotations(subtask.rotations)].filter(Boolean).join(" · ") || "—";
  const named = nameOf(c);
  return {
    id: subtask.id,
    label: named.label,
    name: named.name,
    kind: c.kind,
    running: isBusy(c.live),
    step: stepOf(c, doneIds, now, named.isNote),
    stepLive: stepIsLive(c),
    age: c.kind === "wait" || c.lastReport === null ? "" : shortAge(now - c.lastReport),
    status: c.child ? "—" : subtask.statusRaw ?? subtask.status ?? "—",
    lastReport: lastReportLine(c, now),
    runs,
    context,
    gate: subtask.gateLine ?? "Not at a gate yet",
  };
}

function askOf(c: Classified, now: number, names: Naming): Ask {
  const { subtask, agent } = c;
  const who = names.title(subtask.id);
  const since = c.lastReport;
  const base = { key: subtask.id, who, subtask: subtask.id, since, age: since === null ? "" : shortAge(now - since), title: null, replyTitle: null, links: [], threads: [], replies: [], answered: null };
  if (c.live?.hasPendingInteraction) {
    return { ...base, kind: "thread", ...pendingContent(c.live.pending, `${who} waits on an approval or a question in its thread.`), drafts: null };
  }
  if (subtask.status === "ready") {
    const note = statusNote(subtask, 220);
    const facts = [
      subtask.delivery && `- **Lands:** ${subtask.delivery}`,
      subtask.version && `- **Version:** \`${subtask.version}\``,
      subtask.gateLine && `- **Gate:** ${subtask.gateLine}`,
    ].filter(Boolean);
    const what = subtask.version ? `${subtask.id} at ${subtask.version}` : subtask.id;
    return {
      ...base,
      kind: "decision",
      title: note ? capitalize(names.clean(note) || note) : `${who} passed its checks and waits for your word to land`,
      text: facts.length ? facts.join("\n") : "The ledger names no branch, version or gate for it. Ask the orchestrator what lands before you answer.",
      drafts: { primary: `${what}: go ahead and land it.`, secondary: `${subtask.id}: not yet, hold the landing.` },
    };
  }
  if (subtask.status === "card") {
    return { ...base, kind: "thread", text: `${who} waits for you to start its card in this chat.`, drafts: null };
  }
  const text = agent?.lastOutput?.trim() || `${who} asked a question; the orchestrator has it. Ask the orchestrator what it needs.`;
  return { ...base, kind: "question", text, drafts: { primary: `Re ${subtask.id}: ` } };
}

/** The pending interaction's own words; the fallback only until bb has returned them. */
function pendingContent(pending: Pending | null | undefined, fallback: string): { title: string | null; text: string } {
  return pending ? { title: pending.title, text: pending.text } : { title: null, text: fallback };
}

/** `T2: Approve the draft` → T2 and «Approve the draft», when T2 is a subtask of this ledger. */
function subtaskNamed(text: string, byId: Map<string, Subtask>): { subtask: Subtask; rest: string } | null {
  const match = /^\s*([^\s:|]+):\s+(\S[\s\S]*)$/.exec(text);
  const subtask = match ? byId.get(match[1]!) : undefined;
  return subtask ? { subtask, rest: match![2]!.trim() } : null;
}

/** A «For the owner» line without a `T2:` prefix that links one subtask's thread is about that subtask. */
function subtaskByThread(threads: string[], subtasks: Subtask[], title: string): { subtask: Subtask; rest: string } | null {
  const hits = subtasks.filter((s) => s.threadId && threads.includes(s.threadId));
  return hits.length === 1 ? { subtask: hits[0]!, rest: title.trim() } : null;
}

function recapLine(entry: { text: string; at: string | null } | null, now: number): RecapLine | null {
  const text = firstLine(entry?.text ?? null, 220);
  if (!text) return null;
  const at = entry?.at ? Date.parse(entry.at) : NaN;
  return { text, age: Number.isFinite(at) && at <= now ? shortAge(now - at) : "" };
}

/** «thread-tree-sidebar-v2 · S11», «… · D3 #1», «… · RV-I2» → the id an orchestrator puts after its children's titles. */
export function childLabel(title: string | null | undefined): { label: string; rest: string } | null {
  const match = / · ((?:RV-)?[A-Z]{1,4}\d+[a-z]?)(?: #\d+)?$/.exec(title?.trim() ?? "");
  return match ? { label: match[1]!, rest: title!.trim().slice(0, match.index) } : null;
}

const childSubtask = (id: string, threadId: string, role: string | null): Subtask => ({
  id, name: null, role, threadId, status: null, statusRaw: null, modelRaw: null, dependsOn: [], gateLine: null, gateFailures: 0, lastFailedKind: null, rotations: 0,
});

const liveFirst = (t: LiveThread) => (isBusy(t) || t.hasPendingInteraction ? 1 : 0);

/** Child threads the ledger doesn't name: one fills its id's session-less row, the rest show while they run or ask. */
function withChildren(input: ViewInput): { subtasks: Subtask[]; children: Classified[] } {
  const subtasks = [...input.ledger.subtasks];
  const named = new Set(subtasks.flatMap((s) => (s.threadId ? [s.threadId] : [])));
  const taken = new Set(subtasks.flatMap((s) => (s.threadId ? [s.id] : [])));
  const children: Classified[] = [];
  const own = Object.entries(input.live)
    .filter(([id, t]) => t.parentThreadId === input.orchestratorThreadId && !t.hidden && !named.has(id))
    .sort(([, a], [, b]) => liveFirst(b) - liveFirst(a) || b.createdAt - a.createdAt);
  for (const [threadId, live] of own) {
    const parsed = childLabel(live.title);
    const label = parsed && !taken.has(parsed.label) ? parsed.label : null;
    if (label) taken.add(label);
    const row = label ? subtasks.findIndex((s) => s.id === label) : -1;
    if (row >= 0) {
      subtasks[row] = { ...subtasks[row]!, threadId };
      continue;
    }
    if (!isBusy(live) && !live.hasPendingInteraction) continue;
    children.push({
      subtask: childSubtask(threadId, threadId, label?.startsWith("RV-") ? "reviewer" : null),
      child: { label: label ?? "", name: label ? parsed!.rest : live.title ?? threadId },
      kind: live.hasPendingInteraction ? "you" : "work",
      reason: null,
      lastReport: live.latestAttentionAt || live.createdAt || null,
      agent: null,
      live,
      activity: input.activity?.[threadId] ?? null,
    });
  }
  return { subtasks, children };
}

const stripQuotes = (text: string) => text.trim().replace(/^(?:«([\s\S]*)»|"([\s\S]*)")$/, (_, a, b) => a ?? b).replace(/(?:…|\.\.\.)$/, "").trim().toLowerCase();

/** The contract's Owner-wait match: a `waiting on: owner` value is a prefix of an ask's title, or the title of it. */
export function ownerWaitMatches(value: string, title: string): boolean {
  const left = stripQuotes(value);
  const right = title.trim().toLowerCase();
  return left !== "" && (right.startsWith(left) || left.startsWith(right));
}

const WAITING_ON_YOU = /^\s*(?:Waiting on you|Ждёт тебя):/i;
const INTERACTIVE_UI = /```ui\b[\s\S]*?\b(?:Form|Button|Buttons|Select)\b[\s\S]*?```/;

/** The orchestrator's last message ends on the closing line that says it waits on the owner, or holds an interactive form. */
export function asksInChat(report: string | null | undefined): boolean {
  if (!report) return false;
  const last = report.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
  return WAITING_ON_YOU.test(last) || INTERACTIVE_UI.test(report);
}

export interface ChatQuestion {
  /** The extracted question before display rewriting or shortening. */
  identity: string;
  question: string;
  context?: string;
  /** Button, Buttons and Select options, in order. */
  choices: string[];
  /** A form's field labels. */
  fields: string[];
}

const QUOTED = /"((?:[^"\\]|\\.)*)"/g;
const unquote = (text: string) => text.replace(/\\(.)/g, "$1").trim();
const quoted = (text: string) => [...text.matchAll(QUOTED)].map((m) => unquote(m[1]!)).filter(Boolean);
const firstQuoted = (body: string, call: RegExp) => {
  const at = body.search(call);
  return at === -1 ? null : quoted(body.slice(at))[0] ?? null;
};
const CHAT_PARAGRAPH_MAX = 160;

/** What the orchestrator's last message asks: its interactive ```ui card (title, choices, form fields), else its last «Waiting on you:» line, else its last paragraph. */
export function chatQuestion(report: string | null | undefined): ChatQuestion | null {
  if (!report) return null;
  const body = [...report.matchAll(/```ui\b[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]!).filter((b) => INTERACTIVE_UI.test(`\`\`\`ui\n${b}\`\`\``)).at(-1);
  if (body) {
    const choices: string[] = [];
    for (const m of body.matchAll(/\bButton\s*\(\s*"((?:[^"\\]|\\.)*)"/g)) choices.push(unquote(m[1]!));
    for (const m of body.matchAll(/\b(?:Buttons\s*\(|Select\s*\(\s*"(?:[^"\\]|\\.)*"\s*,)\s*\[([^\]]*)\]/g)) choices.push(...quoted(m[1]!));
    const form = /\bForm\s*\(/.test(body);
    const fields = form ? [...body.matchAll(/\b(?!Card\b|Form\b|Button\b|Buttons\b|Text\b)([A-Z]\w*)\s*\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => unquote(m[2]!)) : [];
    const question = firstQuoted(body, /\b(?:Card|Form)\s*\(\s*"/) ?? firstQuoted(body, /\bSelect\s*\(\s*"/) ?? (form ? fields[0] : null) ?? null;
    if (question || choices.length) return { identity: question ?? "Choose an answer", question: question ?? "Choose an answer", choices: [...new Set(choices)], fields };
  }
  const words = spokenText(report);
  const waiting = words.split("\n").map((line) => line.trim()).filter((line) => WAITING_ON_YOU.test(line)).at(-1);
  if (waiting) return shortQuestion(waiting.replace(WAITING_ON_YOU, "").trim());
  const paragraph = words.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).at(-1);
  if (!paragraph) return null;
  return shortQuestion(paragraph);
}

function shortQuestion(text: string): ChatQuestion {
  const first = text.match(/^.*?[?!.](?=\s|$)/)?.[0] ?? text;
  const review = /(?:look at|review|check).*(?:orchestration view|new view)/i.test(first);
  const title = review ? "Does the new Orchestration view look right?" : first;
  const question = title.length > CHAT_PARAGRAPH_MAX ? `${title.slice(0, CHAT_PARAGRAPH_MAX - 1).trimEnd()}…` : title;
  const context = review ? text : text.slice(question.length).trim();
  return { identity: text, question, choices: [], fields: [], ...(context ? { context } : {}) };
}

export function sameChatQuestion(a: string, b: string): boolean {
  const key = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return !!key(a) && key(a) === key(b);
}

/** The chat-ask card's wording: the question in plain words, then its choices or fields. */
export function chatAskCard(asked: ChatQuestion | null, clean: (text: string) => string): { title: string; text: string } {
  if (!asked) return { title: "The orchestrator has a question for you", text: "Reply here when you're ready." };
  const question = clean(asked.question) || asked.question;
  const lines = [
    "Reply here when you're ready.",
    asked.choices.length ? `Choices: ${asked.choices.map((c) => `«${c}»`).join(" / ")}` : null,
    asked.fields.length ? `It asks for: ${asked.fields.join(", ")}` : null,
    asked.context ? clean(asked.context) : null,
  ].filter(Boolean);
  return { title: question, text: lines.join("\n\n") };
}

const ageSince = (iso: string | null, now: number): string => {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) && at <= now ? shortAge(now - at) : "";
};

function updatedOf(input: ViewInput, source: NowView["source"], block: LedgerSummary["now"], running: boolean, lastTurnStartedAt: number | null): NowView["updated"] {
  const { now } = input;
  const ledgerAge = input.ledgerModifiedAt != null ? shortAge(now - input.ledgerModifiedAt) : null;
  const fromLedger = (): NowView["updated"] => ({ age: ledgerAge ?? "", stale: false, from: ledgerAge === null ? null : "ledger", label: ledgerAge === null ? "" : `ledger written ${ledgerAge === "now" ? "just now" : `${ledgerAge} ago`}` });
  if (source !== "block" || !block?.updated) return fromLedger();
  if (/^\d{4}-\d{2}-\d{2}$/.test(block.updated)) return { age: block.updated, stale: false, from: "block", label: `updated ${block.updated}` };
  const at = Date.parse(block.updated);
  if (!Number.isFinite(at)) return { age: block.updated, stale: false, from: "block", label: `updated ${block.updated}` };
  const age = shortAge(Math.max(0, now - at));
  const stale = !running && lastTurnStartedAt !== null && lastTurnStartedAt > at + STALE_GRACE_MS;
  return { age, stale, from: "block", label: `updated ${age === "now" ? "just now" : `${age} ago`}${stale ? " · the orchestrator has run since" : ""}` };
}

function buildNow(input: ViewInput, allAsks: Ask[]): NowView {
  const openAsks = allAsks.filter((a) => !a.answered);
  const { ledger, now } = input;
  const live = input.live[input.orchestratorThreadId] ?? null;
  const activity = input.activity?.[input.orchestratorThreadId] ?? null;
  const block = ledger.now ?? null;
  const source: NowView["source"] = block?.structured ? "block" : block && ledger.checkpoint ? "text" : "none";
  const running = isBusy(live);
  const state: NowView["orchestrator"]["state"] = !live ? "unknown" : live.hasPendingInteraction ? "asking" : running ? "running" : "idle";
  const orchestrator = {
    state,
    background: live?.backgroundCommands ?? 0,
    age: state === "running" ? (activity?.turnStartedAt != null ? shortAge(now - activity.turnStartedAt) : "") : live?.latestAttentionAt ? shortAge(now - live.latestAttentionAt) : "",
    activity: state === "running" && activity?.step && activity.stepStartedAt !== null ? `${activity.step} · ${stepAge(now - activity.stepStartedAt)}` : null,
  };
  const lastTurn = running || !input.report ? null : (() => {
    const text = firstLine(input.report.text, 140);
    return text ? { text, age: live?.latestAttentionAt ? shortAge(now - live.latestAttentionAt) : "" } : null;
  })();

  const waits: NowWait[] = [];
  const ownerWaits = (block?.waitingOn ?? []).filter((w) => w.who.toLowerCase() === "owner");
  for (const wait of block?.waitingOn ?? []) {
    const owner = wait.who.toLowerCase() === "owner";
    waits.push({ who: wait.who, label: owner ? "You" : wait.subtask ?? wait.who, subtask: owner ? null : wait.subtask, what: wait.what, age: ageSince(wait.since, now), kind: owner ? "owner" : wait.subtask ? "subtask" : "other", since: wait.since });
  }
  const ownerAsks = openAsks.filter((a) => a.kind === "owner");
  for (const ask of ownerAsks) {
    if (ownerWaits.some((w) => ownerWaitMatches(w.what, ask.replyTitle ?? ask.title ?? ""))) continue;
    waits.push({ who: "owner", label: "You", subtask: null, what: ask.title ?? ask.text, age: "", kind: "owner" });
  }
  const backgroundWaits = block?.backgroundWaits ?? [];
  for (const wait of backgroundWaits) waits.push({ who: "background", label: "Background", subtask: null, what: wait, age: "", kind: "background" });
  const liveCommands = live?.backgroundCommands ?? 0;
  if (liveCommands > backgroundWaits.length) waits.push({ who: "background", label: "Background", subtask: null, what: `${plural(liveCommands, "command", "commands")} running`, age: "", kind: "background" });

  const reportedQuestion = asksInChat(input.report?.text) ? chatQuestion(input.report?.text)?.identity : null;
  const question = reportedQuestion ?? ownerWaits.at(-1)?.what;
  const matching = question ? allAsks.flatMap((a) => a.group ?? [a]).filter((a) => a.kind === "owner" && (reportedQuestion ? sameChatQuestion(a.replyTitle ?? a.title ?? "", question) : ownerWaitMatches(question, a.replyTitle ?? a.title ?? ""))) : [];
  const answered = matching.some((a) => a.answered && (activity?.lastTurnStartedAt ?? 0) <= a.answered.at);
  const mismatch = ledger.status !== "closed" && state === "idle" && !matching.some((a) => !a.answered) && !answered
    && (asksInChat(input.report?.text) || ownerWaits.length > 0);
  if (answered) {
    for (let i = waits.length - 1; i >= 0; i--) {
      if (waits[i]!.kind === "owner" && matching.some((a) => ownerWaitMatches(waits[i]!.what, a.replyTitle ?? a.title ?? ""))) waits.splice(i, 1);
    }
  }
  if (mismatch) waits.push({ who: "owner", label: "You", subtask: null, what: "asked in the chat", age: "", kind: "owner" });

  const lastTurnStartedAt = activity?.lastTurnStartedAt ?? live?.latestAttentionAt ?? null;
  const line = (text: string | null) => (text ? firstLine(text, 220) : null);
  return {
    source,
    orchestrator,
    lastTurn,
    doing: source === "block" ? line(block!.doing) : null,
    waits,
    mismatch,
    next: source === "block" ? line(block!.next) : null,
    blockedBy: source === "block" ? line(block!.blockedBy) : null,
    lastDecision: recapLine(ledger.lastDecision, now),
    updated: updatedOf(input, source, block, running, lastTurnStartedAt),
    text: ledger.checkpoint?.text ?? null,
  };
}

export function buildView(input: ViewInput): View {
  const { ledger, now } = input;
  const { subtasks, children } = withChildren(input);
  const planned = subtasks.map((s) => classify(s, input));
  const classified = [...planned, ...children];
  const doneIds = new Set(planned.filter((c) => DONE.has(c.subtask.status ?? "")).map((c) => c.subtask.id));
  const rows = classified.map((c) => toRow(c, doneIds, now));
  const names = naming(classified, input);

  const allAsks = classified.filter((c) => c.kind === "you").map((c) => askOf(c, now, names));
  const orchestrator = input.live[input.orchestratorThreadId];
  if (orchestrator?.hasPendingInteraction) {
    allAsks.push({
      key: "orchestrator",
      who: "Orchestrator",
      subtask: null,
      since: orchestrator.latestAttentionAt || null,
      age: orchestrator.latestAttentionAt ? shortAge(now - orchestrator.latestAttentionAt) : "",
      replyTitle: null,
      ...pendingContent(orchestrator.pending, "The orchestrator waits on an approval or a question in this chat."),
      links: [],
      threads: [],
      replies: [],
      kind: "thread",
      drafts: null,
      answered: null,
    });
  }
  const notes: string[] = [];
  const freeTextNotes: string[] = [];
  const freeAsks: Ask[] = [];
  const byId = new Map(subtasks.map((s) => [s.id, s]));
  ledger.forTheOwner.forEach((line, i) => {
    const item = parseOwnerItem(line, ledger.status);
    if (item.kind === "note") {
      (item.freeText ? freeTextNotes : notes).push(item.text);
      return;
    }
    const named = subtaskNamed(item.title, byId) ?? subtaskByThread(item.threads, subtasks, item.title);
    const who = named ? names.title(named.subtask.id) : "From the ledger";
    const threads = named?.subtask.threadId && !item.threads.includes(named.subtask.threadId) ? [...item.threads, named.subtask.threadId] : item.threads;
    const title = named?.rest ?? item.title;
    const ask: Ask = {
      key: `owner-${i}`, who, subtask: named?.subtask.id ?? null, since: null, age: "", kind: "owner", links: item.links, threads,
      title: capitalize(names.clean(title) || title), replyTitle: item.title, text: capitalize(names.clean(item.why ?? "")), drafts: { primary: replyPrefix(item.title) },
      replies: item.options.map((label) => ({ label, draft: replyDraft(item.title, label) })),
      answered: input.answered?.[item.title] ?? null,
      ...(item.format === "free text" ? { freeText: true } : {}),
    };
    (item.format === "free text" ? freeAsks : allAsks).push(ask);
  });
  if (freeAsks.length >= FREE_TEXT_GROUP_FROM) {
    const answers = freeAsks.flatMap((a) => (a.answered ? [a.answered] : []));
    allAsks.push({
      key: "owner-free-text", who: "From the ledger", subtask: null, since: null, age: "", kind: "owner", links: [], threads: [],
      title: `${freeAsks.length} lines in «For the owner» are written as free text — the orchestrator should rewrite them`,
      replyTitle: null, text: "", drafts: null, replies: [], freeText: true, group: freeAsks,
      answered: answers.length === freeAsks.length ? answers.reduce((a, b) => (b.at > a.at ? b : a)) : null,
    });
  } else allAsks.push(...freeAsks);
  /** An open ledger line about a subtask is what the orchestrator needs from the owner for it. */
  const covered = new Set(allAsks.filter((a) => a.kind === "owner" && a.subtask && !a.answered).map((a) => a.subtask!));
  for (let i = allAsks.length - 1; i >= 0; i--) {
    if (allAsks[i]!.kind === "decision" && covered.has(allAsks[i]!.subtask!)) allAsks.splice(i, 1);
  }
  allAsks.sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity));
  const answered = allAsks.filter((a) => a.answered);
  const asks = allAsks.filter((a) => !a.answered);

  const active = rows.filter((r) => r.kind !== "done" && r.kind !== "you");
  const stuck = classified.filter((c) => c.kind === "stuck")
    .sort((a, b) => STUCK_ORDER[a.reason!] - STUCK_ORDER[b.reason!] || (a.lastReport ?? 0) - (b.lastReport ?? 0));
  active.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || stuck.findIndex((c) => c.subtask.id === a.id) - stuck.findIndex((c) => c.subtask.id === b.id));
  const done = rows.filter((r) => r.kind === "done");
  const nowView = buildNow(input, allAsks);
  if (nowView.mismatch) {
    const asked = (asksInChat(input.report?.text) ? chatQuestion(input.report?.text) : null) ?? (ledger.now?.waitingOn ?? []).filter((w) => w.who.toLowerCase() === "owner").map((w) => ({ identity: w.what, question: w.what, choices: [], fields: [] })).at(-1) ?? null;
    const card = chatAskCard(asked, (text) => capitalize(names.clean(text)));
    asks.unshift({
      key: "chat-mismatch", who: "Orchestrator", subtask: null, since: orchestrator?.latestAttentionAt || null, age: orchestrator?.latestAttentionAt ? shortAge(now - orchestrator.latestAttentionAt) : "",
      title: card.title, replyTitle: null, text: card.text, links: [], threads: [], replies: [], kind: "thread", drafts: null, answered: null,
    });
  }

  const lastHandover = ledger.lastHandover;
  const history = {
    sessions: ledger.orchestratorSessions === 1
      ? "This is the first orchestrator session."
      : `This is orchestrator session ${ledger.orchestratorSessions}. The plan includes subtasks from all ${ledger.orchestratorSessions}.`,
    handover: lastHandover?.why ?? null,
    ledger: ledger.path,
    warnings: ledger.warnings,
    notes,
    freeTextNotes,
  };
  const threadIds: Record<string, string> = Object.fromEntries(classified.flatMap((c) => (c.subtask.threadId ? [[c.subtask.id, c.subtask.threadId]] : [])));
  if (nowView.mismatch) threadIds["chat-mismatch"] = input.orchestratorThreadId;
  const phase = orchestrationPhase(ledger, rows, isBusy(orchestrator));
  const sections = buildSections({ input, classified, rows, asks, now: nowView, stuck, names });
  const { status } = sections;

  const head = stuck[0];
  const nudge = head ? nudgeFor(head, names, now) : null;
  return {
    phase,
    state: STATE_OF[status.state],
    recap: { goal: ledger.goal },
    now: nowView,
    sections,
    rowLabel: `${status.word} · ${status.sentence}`,
    asks,
    answered,
    nudge,
    active,
    done,
    threadIds,
    history,
  };
}

const STATE_OF: Record<Sections["status"]["state"], View["state"]> = {
  needs: "needs", blocked: "stuck", paused: "stuck", stuck: "stuck", done: "done", planning: "planning", running: "moving", waiting: "moving",
};

/** The stuck part's nudge: the label and text name it, the draft keeps its id for the orchestrator. */
function nudgeFor(head: Classified, names: Naming, now: number): View["nudge"] {
  const id = head.subtask.id;
  const name = names.name(id) ?? id;
  const title = names.title(id);
  const label = `Ask the orchestrator about «${name}»`;
  if (head.reason === "circles") {
    const failed = head.subtask.lastFailedKind ?? "the gate";
    return { label, text: `${title} is going in circles: ${failed} failed ${head.subtask.gateFailures} times`, draft: `${id} («${name}») has failed ${failed} ${head.subtask.gateFailures} times. What's the plan?` };
  }
  if (head.reason === "blocked") {
    const note = names.clean(statusNote(head.subtask));
    return { label, text: `${title} is blocked${note ? `: ${note}` : ""}`, draft: `What is ${id} («${name}») blocked on, and what would unblock it?` };
  }
  const quiet = longAge(now - head.lastReport!);
  return { label, text: `${title} has been quiet for ${quiet}`, draft: `What is ${id} («${name}») doing? It hasn't reported for ${quiet}.` };
}

/** Answers go to the orchestrator; only a prompt bb holds in another thread is answered there. */
export function threadsToOpen(ask: Ask, threadId: string | null): string[] {
  if (ask.kind !== "thread") return [];
  return threadId ? [threadId] : ask.threads;
}

/** What a «sent» marker sticks to: a new question, decision or ledger line under the same key is a new ask. */
export function askIdentity(ask: Ask): string {
  return [ask.key, ask.kind, ask.since ?? "", ask.replyTitle ?? "", ask.text].join("\u0000");
}
