export type PartState = "done" | "running" | "waiting" | "not-started";

export type Part = { name: string; role: string | null; state: PartState; word: string };

export type Progress = {
  title: string;
  stateWord: "Needs you" | "Blocked" | "In progress" | "Waiting" | "Done" | "Planning";
  sentence: string;
  done: number;
  total: number;
  parts: Part[];
  asks: string[];
};

type ExportSubtask = {
  id?: string;
  name?: string | null;
  delivery?: string | null;
  role?: { name?: string | null } | null;
  status?: { value?: string | null } | null;
};

type Export = {
  ledger?: string;
  goal?: string | null;
  subtasks?: ExportSubtask[];
  for_the_owner?: string[];
  current_checkpoint?: { blocked_by?: string | null } | null;
};

const NOUNS: Record<string, string> = {
  researcher: "Research",
  designer: "Design",
  planner: "Plan",
  implementer: "Build",
  runner: "Run",
};

const WORDS: Record<string, [PartState, string]> = {
  planned: ["not-started", "Not started"],
  "waiting-dependency": ["not-started", "Not started"],
  card: ["waiting", "Waits for you to start it"],
  briefed: ["running", "Starting"],
  working: ["running", "In progress"],
  question: ["waiting", "Has a question for you"],
  blocked: ["waiting", "Blocked"],
  delivered: ["waiting", "Ready for checks"],
  gate: ["running", "Being checked"],
  ready: ["waiting", "Ready to land, waits for your OK"],
  landed: ["done", "Landed"],
  verified: ["done", "Done"],
};

export function deliveryName(delivery: string): string {
  const path = delivery.split(/\s+/).find((word) => word.includes("/")) ?? delivery;
  const stem = (path.split("/").pop() ?? path).replace(/\.[a-z]+$/i, "").replace(/^[A-Z]+\d+-/, "");
  const words = stem.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : delivery;
}

export function progressModel(data: Export, extraRunning: string[] = []): Progress {
  const parts: Part[] = [];
  for (const row of data.subtasks ?? []) {
    const role = row.role?.name ?? null;
    if (role === "reviewer") continue;
    const status = row.status?.value ?? "";
    if (status === "dropped") continue;
    const [state, word] = WORDS[status] ?? ["waiting", status || "Unknown"];
    const name = row.name || (row.delivery ? deliveryName(row.delivery) : row.id ?? "Unnamed");
    parts.push({ name: role && NOUNS[role] ? `${NOUNS[role]} · ${name}` : name, role, state, word });
  }
  for (const name of extraRunning) parts.push({ name, role: null, state: "running", word: "In progress" });
  const order: PartState[] = ["running", "waiting", "not-started", "done"];
  parts.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));

  const asks = (data.for_the_owner ?? [])
    .filter((line) => line.startsWith("ask:"))
    .map((line) => line.slice(4).replace(/\s+—\s+since\s+\S+$/, "").trim());
  const done = parts.filter((part) => part.state === "done").length;
  const running = parts.filter((part) => part.state === "running");
  const blocked = data.current_checkpoint?.blocked_by ?? null;

  let stateWord: Progress["stateWord"];
  let sentence: string;
  if (asks.length > 0) {
    stateWord = "Needs you";
    sentence = asks.length === 1 ? "1 decision" : `${asks.length} decisions`;
  } else if (blocked && blocked !== "none") {
    stateWord = "Blocked";
    sentence = blocked;
  } else if (running.length > 0) {
    stateWord = "In progress";
    sentence = running.length === 1 ? running[0].name : `${running[0].name} and ${running.length - 1} more are running`;
  } else if (parts.length === 0) {
    stateWord = "Planning";
    sentence = "The orchestrator is splitting the goal into parts";
  } else if (done === parts.length) {
    stateWord = "Done";
    sentence = `All ${parts.length} parts done`;
  } else {
    stateWord = "Waiting";
    sentence = "Nothing is running";
  }
  const title = (data.ledger ?? "").split("/").pop()?.replace(/\.md$/, "") || "Orchestration";
  return { title, stateWord, sentence, done, total: parts.length, parts, asks };
}
