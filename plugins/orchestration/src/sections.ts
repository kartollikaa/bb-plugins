// The human view's sections (docs/human-view.md §2): status line, Working now, Next, Plan, Recently and Details, in names and plain words.
import type { Ask, Classified, NowView, Row, ViewInput } from "./view.ts";
import { briefName, briefSentence, capName, capitalize, clampWords, cleanText, deliveryName, FUTURE_SKEW_MS, isBookkeeping, parseLedgerTime, partTitle, roleNoun, statusWord, when } from "./human.ts";
import { parseOwnerItem } from "./owner.ts";
import { firstLine, reportGist, statusNote } from "./text.ts";

export type PartGlyph = "done" | "running" | "active" | "you" | "stuck" | "todo";
/** A step's place on the Plan's timeline. */
export type StepStage = "done" | "now" | "you" | "next";
export type StatusState = "needs" | "blocked" | "paused" | "stuck" | "running" | "waiting" | "done" | "planning";

export interface StatusLine {
  state: StatusState;
  word: string;
  sentence: string;
  /** «6 of 7 parts done»; empty while there are no parts. */
  progress: string;
  nothingNeedsYou: boolean;
}

export interface PlanPart {
  key: string;
  /** 1-based, in landing order (docs/human-view.md §2.6). */
  step: number;
  stage: StepStage;
  /** One plain line: the brief's first sentence, else the first «Done when» criterion, else the delivery, else the landing-queue entry. */
  description: string | null;
  /** The ledger id, or the id a child's title ends with; shown only in Details. */
  id: string;
  title: string;
  word: string;
  age: string;
  after: string | null;
  glyph: PartGlyph;
  running: boolean;
  note: string | null;
  report: string | null;
  gate: string | null;
  review: string | null;
  /** The ledger says open, but bb archived its thread. */
  archived: boolean;
  details: string;
  runs: string;
  context: string;
}

export interface WorkingRow {
  key: string;
  title: string;
  detail: string | null;
  age: string;
  state: "running" | "waiting";
}

export interface OrchestratorRow {
  state: "running" | "asking" | "idle" | "unknown";
  line: string;
  age: string;
  detail: string | null;
}

export interface RecentEntry {
  key: string;
  text: string;
  when: string;
}

export interface Sections {
  status: StatusLine;
  working: WorkingRow[];
  orchestrator: OrchestratorRow;
  background: string | null;
  /** The orchestrator has run since it last wrote its Now block. */
  stale: boolean;
  next: string | null;
  plan: PlanPart[];
  done: number;
  total: number;
  recently: RecentEntry[];
  details: { skew: boolean; statusRaw: string | null; ids: { id: string; title: string }[] };
}

export interface Naming {
  /** Subtask id or child thread id → «Noun · Name». */
  title(id: string): string;
  /** Subtask id or child label → the bare name, for text. */
  name(id: string): string | null;
  /** The whole name when the title shows it cut to about 40 characters; null when it isn't cut. */
  fullName(id: string): string | null;
  /** The part a reviewer row reviews, by the reviewer's key. */
  reviewOf(id: string): string | null;
  clean(text: string | null | undefined): string;
}

const DONE = new Set(["landed", "verified", "dropped"]);
const REVIEWER_ID = /^RV-(.+)$/;
const ID_WORD = /(?<![\w-])((?:RV-)?[A-Z]{1,4}\d+[a-z]?)(?![\w-])/g;

const keyOf = (c: Classified) => c.subtask.id;
const idOf = (c: Classified) => (c.child ? c.child.label : c.subtask.id);

function isReviewer(c: Classified): boolean {
  return c.subtask.role?.toLowerCase() === "reviewer" || REVIEWER_ID.test(idOf(c));
}

/** The part a reviewer reviews: `RV-<id>`, else the first part id its delivery or name mentions. */
function reviewedId(c: Classified, parts: Set<string>): string | null {
  const own = REVIEWER_ID.exec(idOf(c))?.[1];
  if (own && parts.has(own)) return own;
  for (const text of [c.subtask.delivery, c.subtask.name, c.subtask.statusRaw]) {
    for (const match of (text ?? "").matchAll(ID_WORD)) if (parts.has(match[1]!)) return match[1]!;
  }
  return null;
}

const ledgerSlug = (path: string) => path.split("/").pop()?.replace(/\.md$/, "") ?? "";

export function naming(classified: Classified[], input: ViewInput): Naming {
  const partIds = new Set(classified.filter((c) => !isReviewer(c)).map(idOf).filter(Boolean));
  const names = new Map<string, string>();
  const titles = new Map<string, string>();
  const reviews = new Map<string, string>();
  const slug = ledgerSlug(input.ledger.path);
  const ledgerIds = new Set(input.ledger.subtasks.map((s) => s.id));
  const brief = (c: Classified) => (c.subtask.threadId && !ledgerIds.has(c.subtask.id) ? briefName(input.briefs?.[c.subtask.threadId], idOf(c) || null) : null);
  const fromNote = new Set<string>();
  const sources = new Map<string, string>();
  const rawName = (c: Classified): string => {
    const named = firstLine(c.subtask.name, 200);
    if (named) {
      sources.set(keyOf(c), named);
      return clampWords(named);
    }
    const fromBrief = brief(c);
    if (fromBrief) return fromBrief;
    if (c.child && c.child.name && c.child.name !== slug && !/^thr_/.test(c.child.name)) {
      sources.set(keyOf(c), c.child.name.trim());
      return clampWords(c.child.name);
    }
    const fromDelivery = deliveryName(c.subtask.delivery);
    if (fromDelivery) return fromDelivery;
    const note = statusNote(c.subtask, 200);
    if (note && !c.child) {
      fromNote.add(keyOf(c));
      return clampWords(capitalize(note));
    }
    return idOf(c) || "Unnamed subtask";
  };
  const parts = classified.filter((c) => !isReviewer(c));
  for (const c of parts) names.set(keyOf(c), rawName(c));
  for (const c of parts) if (c.child?.label) names.set(c.child.label, names.get(keyOf(c))!);
  for (const c of classified.filter(isReviewer)) {
    const target = reviewedId(c, partIds);
    if (target) reviews.set(keyOf(c), target);
    else names.set(keyOf(c), rawName(c));
  }
  const nameOf = (id: string): string | null => {
    const target = reviews.get(id);
    return target ? names.get(target) ?? null : names.get(id) ?? null;
  };
  const threadTitles = new Map(Object.entries(input.live).map(([id, t]) => [id, t.title ?? null] as const));
  const clean = (text: string | null | undefined) => cleanText(text, {
    now: input.now,
    name: (id) => {
      const name = names.get(id);
      return name ?? null;
    },
    reviewed: (id) => {
      const target = reviews.get(id) ?? (REVIEWER_ID.exec(id)?.[1] && partIds.has(REVIEWER_ID.exec(id)![1]!) ? REVIEWER_ID.exec(id)![1]! : null);
      return target ? names.get(target) ?? null : null;
    },
    threadTitle: (id) => {
      const hit = classified.find((c) => c.subtask.threadId === id);
      if (hit) return `«${nameOf(keyOf(hit)) ?? idOf(hit)}»`;
      const title = threadTitles.get(id);
      return title ? `«${title}»` : null;
    },
  });
  for (const key of fromNote) names.set(key, clean(names.get(key)) || names.get(key)!);
  const fullNames = new Map<string, string>();
  for (const [key, name] of names) {
    const capped = capName(name);
    const full = sources.get(key) ?? name;
    if (capped !== full) fullNames.set(key, full);
    names.set(key, capped);
  }
  for (const c of classified) {
    const target = reviews.get(keyOf(c));
    if (target) titles.set(keyOf(c), partTitle("Review", names.get(target) ?? target));
    else titles.set(keyOf(c), partTitle(roleNoun(c.subtask.role) ?? (isReviewer(c) ? "Review" : null), names.get(keyOf(c))!));
  }
  return {
    title: (id) => titles.get(id) ?? nameOf(id) ?? id,
    name: nameOf,
    fullName: (id) => fullNames.get(id) ?? null,
    reviewOf: (id) => reviews.get(id) ?? null,
    clean,
  };
}

function glyphOf(c: Classified, running: boolean): PartGlyph {
  if (c.kind === "done") return "done";
  if (c.kind === "you") return "you";
  if (c.kind === "stuck") return "stuck";
  if (running) return "running";
  if (c.kind === "wait") return "todo";
  return "active";
}

function wordOf(c: Classified, row: Row, clean: Naming["clean"]): string {
  const status = c.subtask.status;
  if (c.live?.hasPendingInteraction) return "Waits for you in its thread";
  if (c.child) return row.running ? "In progress" : "Waits for you in its thread";
  if (c.reason === "quiet") return capitalize(row.step.split(" · ")[0]!);
  if (c.reason === "circles") return row.step;
  if (status === "blocked") return statusWord("blocked", clean(statusNote(c.subtask)) || null);
  if (c.kind === "work" && DONE.has(status ?? "") && row.running) return "Running again";
  return statusWord(status);
}

function reviewVerdict(c: Classified): string {
  const raw = (c.subtask.statusRaw ?? "").toLowerCase();
  if (/request(?:ed|s)? changes|changes requested|needs? changes|asked for changes/.test(raw)) return "Review asked for changes";
  if (/\bapprov/.test(raw)) return "Review approved";
  if (DONE.has(c.subtask.status ?? "")) return "Review done";
  if (c.subtask.status === "working" || c.subtask.status === "briefed") return "Review in progress";
  return `Review: ${statusWord(c.subtask.status)}`;
}

const ageOf = (c: Classified, running: boolean, now: number): string => {
  if (!running) return "";
  const from = c.activity?.turnStartedAt ?? c.lastReport;
  return from ? when(from, now) : "";
};

function detailsLine(c: Classified): string {
  const s = c.subtask;
  return [idOf(c) || null, s.statusRaw, s.version && `version ${s.version}`, s.delivery, s.areas && `areas ${s.areas}`].filter(Boolean).join(" · ");
}

function stuckSentence(c: Classified, title: string, row: Row, clean: Naming["clean"]): string {
  if (c.reason === "quiet") return `${title} has been ${row.step.split(" · ")[0]!.toLowerCase()}`;
  if (c.reason === "circles") return `${title} is going in circles: ${row.step.toLowerCase()}`;
  const note = clean(statusNote(c.subtask));
  return `${title} is blocked${note ? `: ${note}` : ""}`;
}

const listing = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lower = (text: string) => (/^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text);

function needsSentence(asks: Ask[]): string {
  let decisions = 0;
  let questions = 0;
  let approvals = 0;
  for (const ask of asks) {
    if (ask.kind === "decision" || (ask.kind === "owner" && ask.replies.length > 0)) decisions += 1;
    else if (ask.kind === "thread" && ask.key !== "chat-mismatch") approvals += 1;
    else questions += 1;
  }
  return listing([
    decisions && plural(decisions, "decision", "decisions"),
    questions && plural(questions, "question", "questions"),
    approvals && plural(approvals, "request in a thread", "requests in threads"),
  ].filter((x): x is string => !!x));
}

export interface SectionsInput {
  input: ViewInput;
  classified: Classified[];
  rows: Row[];
  asks: Ask[];
  now: NowView;
  stuck: Classified[];
  names: Naming;
}

const STAGE_OF: Record<PartGlyph, StepStage> = { done: "done", running: "now", active: "now", stuck: "now", you: "you", todo: "next" };
const QUEUE_ID = /^((?:RV-)?[A-Z]{1,4}\d+[a-z]?)(?![\w-])/;
const DESCRIPTION_MAX = 140;

/** Ledger parts in subtask order, the ones in the landing queue re-seated in queue order; parts the ledger doesn't list follow. */
export function timelineOrder<T extends { key: string }>(parts: readonly T[], ledgerIds: readonly string[], queue: readonly string[]): T[] {
  const inLedger = parts.filter((p) => ledgerIds.includes(p.key)).sort((a, b) => ledgerIds.indexOf(a.key) - ledgerIds.indexOf(b.key));
  const queued = [...new Set(queue.flatMap((line) => QUEUE_ID.exec(line.trim())?.[1] ?? []))].filter((id) => inLedger.some((p) => p.key === id));
  const seated = queued.map((id) => inLedger.find((p) => p.key === id)!);
  let next = 0;
  return [...inLedger.map((p) => (queued.includes(p.key) ? seated[next++]! : p)), ...parts.filter((p) => !ledgerIds.includes(p.key))];
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, text.lastIndexOf(" ", max - 1) > max / 2 ? text.lastIndexOf(" ", max - 1) : max - 1)}…`);
const comparable = (text: string) => text.replace(/…$/, "").trim().toLowerCase();

function descriptionOf(c: Classified, input: ViewInput, names: Naming): string | null {
  const queueLine = (input.ledger.landingQueue ?? []).find((line) => QUEUE_ID.exec(line.trim())?.[1] === c.subtask.id);
  const candidates = [
    c.subtask.threadId ? briefSentence(input.briefs?.[c.subtask.threadId], idOf(c) || null) : null,
    ...(c.subtask.criteria ?? []).slice(0, 1)
      .map((line) => line.replace(/^Shared criterion \([^)]*\):\s*/, "").replace(/\s+[—–-]\s+read the doc\.?$/i, ""))
      .filter((line) => !/\bDone when\b/i.test(line)),
    deliveryName(c.subtask.delivery),
    queueLine ? /^\S+\s*[—–-]\s*([^;]+)/.exec(queueLine.trim())?.[1] ?? null : null,
  ];
  const name = comparable(names.name(keyOf(c)) ?? "");
  for (const raw of candidates) {
    const text = capitalize(names.clean(raw).trim());
    const plain = comparable(text);
    if (text && !(name && (name.startsWith(plain) || plain.startsWith(name)))) return clip(text, DESCRIPTION_MAX);
  }
  return null;
}

/** A gate cell that only names its gate («Gates G-D2»), or an empty gate on a finished part, says nothing to a person. */
function gateOf(c: Classified, clean: (text: string | null | undefined) => string): string | null {
  const line = c.subtask.gateLine;
  if (!line || /^(?:gates?\s+)?G-?[\w-]+$/i.test(line.trim())) return null;
  if (c.kind === "done" && line === "In the gate, nothing has run yet") return null;
  return clean(line) || null;
}

export function buildSections({ input, classified, rows, asks, now: nowView, stuck, names }: SectionsInput): Sections {
  const { ledger, now } = input;
  const { clean } = names;
  const rowOf = new Map(classified.map((c, i) => [keyOf(c), rows[i]!]));
  const reviewers = classified.filter((c) => names.reviewOf(keyOf(c)) !== null);
  const parts = classified.filter((c) => names.reviewOf(keyOf(c)) === null);
  const reviewFor = new Map<string, Classified>();
  for (const r of reviewers) reviewFor.set(names.reviewOf(keyOf(r))!, r);
  const doneIds = new Set(parts.filter((c) => DONE.has(c.subtask.status ?? "")).map(idOf));
  const running = (c: Classified) => rowOf.get(keyOf(c))!.running;

  const plan: PlanPart[] = parts.map((c) => {
    const row = rowOf.get(keyOf(c))!;
    const open = c.subtask.dependsOn.filter((id) => !doneIds.has(id));
    const waitsOnOthers = c.kind === "wait" && open.length > 0;
    const gist = reportGist(c.agent?.lastOutput ?? null)?.gist ?? null;
    const review = reviewFor.get(idOf(c)) ?? reviewFor.get(keyOf(c));
    const glyph = glyphOf(c, row.running);
    return {
      key: keyOf(c),
      step: 0,
      stage: STAGE_OF[glyph],
      description: descriptionOf(c, input, names),
      id: idOf(c),
      title: names.title(keyOf(c)),
      word: wordOf(c, row, clean),
      age: ageOf(c, row.running, now),
      after: waitsOnOthers ? `after ${listing(open.map((id) => names.title(id)))}` : null,
      glyph,
      running: row.running,
      note: clean(statusNote(c.subtask, 220)) || null,
      report: gist ? clean(gist) || null : null,
      gate: gateOf(c, clean),
      review: review ? reviewVerdict(review) : null,
      archived: c.kind !== "done" && c.agent?.archivedAt != null,
      details: [names.fullName(keyOf(c)), detailsLine(c)].filter(Boolean).join(" · "),
      runs: row.runs,
      context: row.context,
    };
  });
  const finished = plan.filter((p) => p.glyph === "done");
  const ordered = timelineOrder(plan, ledger.subtasks.map((s) => s.id), ledger.landingQueue ?? []).map((p, i) => ({ ...p, step: i + 1 }));
  const total = plan.length;
  const done = finished.length;

  const working: WorkingRow[] = [];
  for (const c of classified) {
    if (!running(c)) continue;
    const row = rowOf.get(keyOf(c))!;
    working.push({ key: keyOf(c), title: names.title(keyOf(c)), detail: (row.stepLive ? row.step : clean(row.step)) || null, age: ageOf(c, true, now), state: "running" });
  }
  const orchestratorWaits: string[] = [];
  for (const wait of nowView.waits) {
    if (wait.kind === "owner") {
      if (!orchestratorWaits.includes("you")) orchestratorWaits.push("you");
      continue;
    }
    if (wait.kind === "background") continue;
    const target = wait.subtask ? classified.find((c) => idOf(c) === wait.subtask || keyOf(c) === wait.subtask) : undefined;
    const title = target ? names.title(keyOf(target)) : clean(wait.who) || wait.who;
    const name = target ? `«${names.name(keyOf(target)) ?? title}»` : title;
    if (!orchestratorWaits.includes(name)) orchestratorWaits.push(name);
    if (target && running(target)) continue;
    working.push({ key: `wait-${wait.subtask ?? wait.who}`, title: `Waiting for ${title}`, detail: clean(wait.what) || null, age: sinceLabel(wait.since, now), state: "waiting" });
  }

  const o = nowView.orchestrator;
  const lastSaid = !nowView.doing && o.state !== "running" && input.report ? clean(firstLine(input.report.text, 220)) : "";
  const idleFor = live(input)?.latestAttentionAt ? when(live(input)!.latestAttentionAt, now) : "";
  const orchestrator: OrchestratorRow = {
    state: o.state,
    line: o.state === "unknown" ? "Orchestrator · not in bb's thread list"
      : o.state === "asking" ? "Orchestrator · asking you"
      : o.state === "running" ? `Orchestrator · running${o.activity ? ` · ${o.activity}` : ""}`
      : orchestratorWaits.length ? `Orchestrator · waiting for ${orchestratorWaits.length > 2 ? `${orchestratorWaits[0]} and ${orchestratorWaits.length - 1} others` : listing(orchestratorWaits)}`
      : "Orchestrator · idle",
    age: o.state === "running" ? (input.activity?.[input.orchestratorThreadId]?.turnStartedAt ? when(input.activity[input.orchestratorThreadId]!.turnStartedAt!, now) : "") : o.state === "unknown" ? "" : idleFor ? `idle ${idleFor}` : "",
    detail: nowView.doing ? capitalize(clean(nowView.doing)) || null : lastSaid ? `Last said: ${lastSaid}` : null,
  };
  const background = backgroundLine(input, nowView);

  const status = statusLine({ input, plan, done, total, asks, stuck, names, rowOf, nowView, working, orchestratorRunning: o.state === "running" });
  return {
    status,
    working,
    orchestrator,
    background,
    stale: nowView.updated.stale,
    next: nowView.next ? capitalize(clean(nowView.next)) || null : null,
    plan: ordered,
    done,
    total,
    recently: recently(input, clean),
    details: {
      skew: hasSkew(input),
      statusRaw: ledger.statusRaw ?? null,
      ids: [...parts, ...reviewers].filter((c) => idOf(c)).map((c) => ({ id: idOf(c), title: names.title(keyOf(c)) })),
    },
  };
}

const live = (input: ViewInput) => input.live[input.orchestratorThreadId] ?? null;

function sinceLabel(since: string | null | undefined, now: number): string {
  const at = since ? parseLedgerTime(since) : null;
  return at === null ? "" : when(at, now);
}

function backgroundLine(input: ViewInput, nowView: NowView): string | null {
  const count = Math.max(nowView.orchestrator.background, input.ledger.now?.backgroundWaits.length ?? 0);
  return count ? `${plural(count, "command", "commands")} running in the background` : null;
}

function statusLine(args: {
  input: ViewInput; plan: PlanPart[]; done: number; total: number; asks: Ask[]; stuck: Classified[]; names: Naming;
  rowOf: Map<string, Row>; nowView: NowView; working: WorkingRow[]; orchestratorRunning: boolean;
}): StatusLine {
  const { input, plan, done, total, asks, stuck, names, rowOf, nowView, working, orchestratorRunning } = args;
  const { ledger } = input;
  const progress = total ? `${done} of ${total} parts done` : "";
  const make = (state: StatusState, word: string, sentence: string): StatusLine => ({ state, word, sentence, progress, nothingNeedsYou: asks.length === 0 });
  const blockedBy = nowView.source === "block" ? nowView.blockedBy : null;
  const blocked = ledger.status === "blocked" || (!!blockedBy && !/^none\b/i.test(blockedBy));
  const cause = () => names.clean(blockedBy) || names.clean(ledger.statusRaw?.replace(/^blocked\b[\s:;,—–-]*/i, "").replace(/^\(([^()]*)\)$/, "$1")) || "The ledger says the orchestration is blocked";
  if (asks.length) return make("needs", "Needs you", `${needsSentence(asks)}${blocked ? ` · blocked: ${lower(cause())}` : ""}`);
  if (blocked) return make("blocked", "Blocked", capitalize(cause()));
  if (ledger.status === "paused") return make("paused", "Paused", capitalize(names.clean(ledger.statusRaw?.replace(/^paused\b[\s:;,—–-]*/i, "")) || "The orchestration is paused"));
  const head = stuck[0];
  if (head) return make("stuck", "Stuck", stuckSentence(head, names.title(head.subtask.id), rowOf.get(head.subtask.id)!, names.clean));
  const anyRunning = working.some((w) => w.state === "running");
  if (ledger.status === "closed" && (anyRunning || done < total)) {
    return make("paused", "Closed", `The ledger is closed, but ${total - done} of ${total} parts are still open`);
  }
  if ((ledger.status === "closed" && !anyRunning) || (total > 0 && done === total && !anyRunning)) {
    return make("done", "Done", done === total ? (total === 1 ? "The only part is done" : `All ${total} parts done`) : "The orchestration is closed");
  }
  if (total === 0 && ledger.status !== "closed") return make("planning", "Planning", "The orchestrator is splitting the goal into parts");
  const runningRows = working.filter((w) => w.state === "running");
  if (runningRows.length === 1) {
    const only = runningRows[0]!;
    return make("running", "In progress", only.detail ? `${only.title}: ${lower(only.detail)}` : only.title);
  }
  if (runningRows.length > 1) return make("running", "In progress", `${runningRows[0]!.title} and ${runningRows.length - 1} more are running`);
  if (orchestratorRunning) return make("running", "In progress", nowView.orchestrator.activity ? `The orchestrator is working: ${lower(nowView.orchestrator.activity)}` : "The orchestrator is working");
  const waitedOn = working.find((w) => w.state === "waiting");
  if (waitedOn) return make("waiting", "Waiting", waitedOn.title);
  const checking = plan.find((p) => p.word === "Ready for checks" || p.word.startsWith("Being checked"));
  if (checking) return make("waiting", "Waiting", `Waiting for checks on «${names.name(checking.key) ?? checking.title}»`);
  const pending = plan.filter((p) => p.glyph === "active");
  if (pending.length) return make("waiting", "Waiting", `Waiting for «${names.name(pending[0]!.key) ?? pending[0]!.title}»${pending.length > 1 ? ` and ${pending.length - 1} more` : ""}`);
  return make("waiting", "Waiting", "Nothing is running");
}

function hasSkew(input: ViewInput): boolean {
  const limit = input.now + FUTURE_SKEW_MS;
  const times = [
    ...(input.ledger.journal ?? []).map((row) => row.at),
    input.ledger.now?.updated ?? null,
    ...(input.ledger.now?.waitingOn ?? []).map((w) => w.since),
    input.ledger.checkpoint?.at ?? null,
  ];
  return times.some((at) => {
    const ms = at ? parseLedgerTime(at) : null;
    return ms !== null && ms > limit;
  });
}

const STAMP = /\s*\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)(?:\s*\(host clock\))?/;

/** The newest dated journal rows and «For the owner» notes, bookkeeping skipped; the UI shows the first three. */
export function recently(input: ViewInput, clean: Naming["clean"]): RecentEntry[] {
  const entries: { key: string; text: string; at: number }[] = [];
  const journalTimes = new Set<number>();
  (input.ledger.journal ?? []).forEach((row, i) => {
    const at = row.at ? parseLedgerTime(row.at) : null;
    if (at === null || isBookkeeping(row.text)) return;
    journalTimes.add(at);
    let text = clean(row.text);
    if (row.by?.toLowerCase() === "owner" && !/^you\b/i.test(text)) text = `You: ${text}`;
    if (text) entries.push({ key: `journal-${i}`, text, at });
  });
  input.ledger.forTheOwner.forEach((line, i) => {
    const item = parseOwnerItem(line, input.ledger.status);
    if (item.kind !== "note") return;
    const stamp = STAMP.exec(item.text);
    const at = stamp ? parseLedgerTime(stamp[1]!) : null;
    if (at === null || journalTimes.has(at)) return;
    const text = clean(item.text.replace(STAMP, ""));
    if (text) entries.push({ key: `note-${i}`, text: capitalize(text), at });
  });
  entries.sort((a, b) => b.at - a.at);
  return entries.map((e) => ({ key: e.key, text: e.text, when: when(e.at, input.now) }));
}
