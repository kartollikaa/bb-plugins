import type { CodexStatus, GeneratedStatus, InstallInfo, RoleRow, Snapshot } from "./schema.ts";

export type Route =
  | { kind: "list" }
  | { kind: "role"; name: string }
  | { kind: "propose"; name: string | null };

export function parseSubPath(subPath: string | undefined): Route {
  const parts = (subPath ?? "").split("/").filter((part) => part !== "");
  const [head, name] = parts;
  if (head === "role" && name !== undefined) return { kind: "role", name };
  if (head === "propose") return { kind: "propose", name: name ?? null };
  return { kind: "list" };
}

export const roleSubPath = (name: string) => `role/${name}`;
export const proposeSubPath = (name: string | null) => (name === null ? "propose" : `propose/${name}`);

const RUNTIME_LABELS: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };
export const runtimeLabel = (runtime: string) => RUNTIME_LABELS[runtime] ?? runtime;

/** Runtimes seen across roles, known ones first. */
export function runtimeKeys(roles: RoleRow[]): string[] {
  const keys = new Set<string>();
  for (const role of roles) for (const key of Object.keys(role.runtimes)) keys.add(key);
  const known = Object.keys(RUNTIME_LABELS).filter((key) => keys.has(key));
  return [...known, ...[...keys].filter((key) => !known.includes(key)).sort()];
}

export function accessParts(role: RoleRow): string[] {
  return [role.access, ...(role.shell ? ["shell"] : []), ...(role.web ? ["web"] : [])];
}

export function modelEffort(role: RoleRow, runtime: string, separator: string): string {
  const row = role.runtimes[runtime];
  return row === undefined ? "—" : `${row.model}${separator}${row.effort}`;
}

export function generatedFiles(role: RoleRow): string[] {
  const files: string[] = [];
  if (role.runtimes["claude-code"] !== undefined) files.push(`agents/${role.name}.md`);
  const codex = role.runtimes["codex"];
  if (codex !== undefined) files.push(`codex/agents/${codex.agent}.toml`);
  return files;
}

export function tildePath(path: string, home: string | null): string {
  return home !== null && home !== "" && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path;
}

export function installLine(install: InstallInfo): string {
  const parts = [`team ${install.version ?? "(version unknown)"}`];
  if (install.key !== null) parts.push(install.key);
  if (install.scope !== null) parts.push(`${install.scope} scope`);
  if (install.enabled === false) parts.push("disabled");
  else if (install.enabled === true) parts.push("enabled");
  if (install.source === "setting") parts.push("source: setting teamRoot");
  return parts.join(" · ");
}

export function generatedText(generated: GeneratedStatus): string {
  switch (generated.state) {
    case "current":
      return "current";
    case "stale":
      return `stale (${generated.problems.length} ${generated.problems.length === 1 ? "problem" : "problems"})`;
    case "invalid":
      return `invalid: ${generated.error ?? "a role or the adapter doesn't parse"}`;
    case "unknown":
      return `unknown: ${generated.error ?? "not checked"}`;
  }
}

function countSteps(codex: CodexStatus): string {
  const counts = new Map<string, number>();
  for (const step of codex.steps) counts.set(step.action, (counts.get(step.action) ?? 0) + 1);
  return [...counts].map(([action, count]) => `${count} ${action}`).join(", ");
}

export function codexText(codex: CodexStatus): string {
  switch (codex.state) {
    case "installed":
      return `${codex.steps.length} installed, current`;
    case "not-installed":
      return "not installed";
    case "pending":
      return `updates pending (${countSteps(codex)})`;
    case "conflict":
      return `conflict (${codex.steps.filter((step) => step.action === "conflict").length}): ${codex.message ?? ""}`.trim();
    case "blocked":
      return `blocked: ${codex.message ?? "generated files are not current"}`;
    case "unknown":
      return `unknown: ${codex.message ?? "not checked"}`;
  }
}

export function formatList(snapshot: Snapshot, home: string | null): string {
  const { install, roles } = snapshot;
  if (install === null) return snapshot.installError ?? "team plugin not found";
  const keys = runtimeKeys(roles);
  const lines = [
    installLine(install),
    `root: ${tildePath(install.root, home)}`,
    `generated files: ${generatedText(snapshot.generated)}`,
    `codex agents: ${codexText(snapshot.codex)}${snapshot.codex.dest === null ? "" : ` (${tildePath(snapshot.codex.dest, home)})`}`,
  ];
  if (snapshot.rolesError !== null) return [...lines, "", snapshot.rolesError].join("\n");
  const header = ["ROLE", ...keys.map((key) => key.toUpperCase()), "ACCESS"];
  const rows = roles.map((role) => [role.name, ...keys.map((key) => modelEffort(role, key, "/")), accessParts(role).join(", ")]);
  const widths = header.map((_, column) => Math.max(...[header, ...rows].map((row) => (row[column] ?? "").length)));
  const format = (row: string[]) => row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  ").trimEnd();
  return [...lines, "", format(header), ...rows.map(format)].join("\n");
}
