import type { GeneratedStatus, InstallInfo, RoleRow } from "./schema.ts";

export type ProjectRef = { id: string; name: string; gitRemoteUrl: string | null };

/** `host/owner/repo` in lower case, from an https, ssh or `owner/repo` spelling. */
export function normaliseRepo(value: string): string | null {
  let text = value.trim().toLowerCase();
  if (text === "") return null;
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^[^@/]+@/, "");
  text = text.replace(/^([^/:]+):(?!\d+\/)/, "$1/");
  text = text.replace(/\/+$/, "").replace(/\.git$/, "");
  if (!text.includes("/")) return null;
  if (!/^[^/]+\.[^/]+\//.test(text)) text = `github.com/${text}`;
  return text;
}

export function marketplaceRepo(entry: unknown): string | null {
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return null;
  const source = (entry as { source: unknown }).source;
  if (typeof source !== "object" || source === null) return null;
  const { source: kind, url, repo } = source as { source?: unknown; url?: unknown; repo?: unknown };
  if (kind === "github" && typeof repo === "string") return normaliseRepo(repo);
  if (kind === "git" && typeof url === "string") return normaliseRepo(url);
  return null;
}

export function findSourceProject(repo: string | null, projects: ProjectRef[]): ProjectRef | null {
  if (repo === null) return null;
  return projects.find((project) => project.gitRemoteUrl !== null && normaliseRepo(project.gitRemoteUrl) === repo) ?? null;
}

function firstSentence(text: string): string {
  const cut = text.replace(/^You must not /, "must not ").split(/\.\s/)[0] ?? text;
  return cut.length > 100 ? `${cut.slice(0, 97)}...` : cut.replace(/\.$/, "");
}

function resolvedLine(role: RoleRow): string[] {
  return Object.entries(role.runtimes).map(([runtime, row]) => {
    const parts = [`- ${runtime}: ${row.agent}, ${row.model} / ${row.effort}`];
    if (row.disallowed_tools.length > 0) parts.push(`; blocked tools ${row.disallowed_tools.join(", ")}`);
    if (row.unenforced.length > 0) parts.push(`; not enforced by the runtime: ${row.unenforced.map(firstSentence).join("; ")}`);
    return parts.join("");
  });
}

const generatedWord = (generated: GeneratedStatus) => (generated.state === "unknown" ? "unknown" : generated.state);

export function proposalBrief(input: {
  role: RoleRow | null;
  install: InstallInfo | null;
  roles: RoleRow[];
  generated: GeneratedStatus;
}): string {
  const { role, install, roles, generated } = input;
  const subject = role === null ? "roles" : `\`${role.name}\` role`;
  const installed = install === null
    ? "Installed: team plugin not found."
    : `Installed: team ${install.version ?? "?"} (${install.key ?? install.source}${install.commit === null ? "" : `, commit ${install.commit.slice(0, 7)}`}). Generated files: ${generatedWord(generated)}.`;
  const sourceName = role?.name ?? "<role>";
  const defined = [
    `- plugins/team/roles/${sourceName}.md — the source: frontmatter (intent, tier, effort, access, shell,`,
    "  web) and the process text. Edit by hand.",
    "- plugins/team/adapters/runtimes.json — models, efforts and tool limits per runtime; the only file",
    "  that names a provider, model or runtime tool.",
    `- Generated, never edited by hand: plugins/team/agents/${sourceName}.md,`,
    `  plugins/team/codex/agents/team-${sourceName}.toml, plugins/team/roles.json.`,
  ];
  const now = role === null
    ? roles.map((each) => `- ${each.name}: ${Object.entries(each.runtimes).map(([runtime, row]) => `${runtime} ${row.model}/${row.effort}`).join(", ")}`)
    : resolvedLine(role);
  return [
    `[team-roles] The owner wants to change the \`team\` plugin's ${subject}. Their`,
    "request is the message above; this part is context from the Team roles page in bb.",
    "",
    installed,
    "",
    "Where the role is defined, in this repository:",
    ...defined,
    "",
    "What it resolves to now:",
    ...(now.length > 0 ? now : ["- (roles.json could not be read)"]),
    "",
    "Before you change it:",
    "- Read the repository's README (section «Разработка»), plugins/team/README.md and",
    "  plugins/team/docs/design.md; a change to a decision recorded there updates that record.",
    "- A request that only concerns one project belongs in that project's AGENTS.md or CLAUDE.md, which",
    "  every role reads first — not in the role. Say so if that is what this is.",
    "- Never edit the installed copy under ~/.claude/plugins/cache; it is replaced on update.",
    "",
    "After the change: regenerate with render_roles.py and run every check in the repository README's",
    "pre-commit list («Разработка», «Перед коммитом»). The installed copy only changes after a version bump and an update, and Codex agents",
    "after install_codex_agents.py --apply — leave both to the owner and list them in your report.",
  ].join("\n");
}
