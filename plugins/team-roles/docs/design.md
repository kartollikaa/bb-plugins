# Design: `team-roles` — the `team` plugin's agent roles in bb

Status: proposal, 2026-11-16. Scope approved by Dmitrii for v1: read-only view, generated-files
staleness, Codex install status, a «Propose a change» thread; no in-place edits; not published.

## Problem

Dmitrii keeps his agent team in the `team` Claude Code plugin (`team@kartollika-ai-hub`, installed at
user scope, version 0.2.0 when this was written). Six roles — `planner`, `designer`, `implementer`,
`reviewer`, `runner`, `researcher` — each carry an intent, a model tier, an effort, tool limits and a
process prompt, written once and rendered for Claude Code and Codex (team `README.md`, «Устройство»;
team `docs/design.md`, «One neutral source, generated native files»).

In bb none of that is visible:

- To see which model and effort `designer` runs at, or what `reviewer` is told, Dmitrii has to open
  files in `~/.claude/plugins/cache/kartollika-ai-hub/team/<version>/` or run
  `python3 <root>/scripts/render_roles.py resolve <role> --runtime <rt>`. The version folder changes
  with every plugin update.
- Whether the installed copy is internally consistent (`render_roles.py --check`) and whether the
  Codex agents in `~/.codex/agents` match it (`install_codex_agents.py`, dry run by default) are two
  more commands nobody runs unless something already looks wrong.
- When a role should change, the change belongs in the plugin's source repo (`plugins/team/roles/`
  and `plugins/team/adapters/runtimes.json` in `kartollika-ai-hub`), followed by a regeneration,
  four checks and a version bump (hub `README.md`, «Разработка»). The installed copy is overwritten on
  update, so editing it is lost work. Nothing in bb routes a change request there.

What the owner asked for: «view it, manage it, maybe structure it … make additions in the prompt if
possible». Two facts bound what «additions» can mean (orchestrator's brief, checked against the team
plugin): Claude Code has no way to append to a plugin agent's prompt, and bb's
`contributeInstructions` reaches bb threads only. Per-project additions already go through the
project's `AGENTS.md`/`CLAUDE.md`, which every role reads first (`roles/*.md`, «Read first»). So the
only durable way to change a role is a change to its source, which v1 proposes through a thread.

## Requirements

1. **R1 List.** One page lists every role of the installed `team` plugin with its intent, its
   access, shell and web flags, and per runtime its model and effort.
2. **R2 Detail.** A role's detail adds the role's tier and effort, and per runtime the agent name, the
   disallowed tools, the session features, the limits the runtime does not enforce, and the full
   prompt exactly as `render_roles.py resolve` prints it; plus the role's source file and its
   generated files.
3. **R3 Locate.** The server finds the install without a hard-coded version or marketplace folder and
   follows a plugin update with no change to `team-roles`.
4. **R4 Read-only.** `team-roles` writes nothing in the team install, the Codex home or Claude Code's
   config: no file edits, no script mode that writes (`render_roles.py` without a subcommand,
   `install_codex_agents.py --apply`/`--force`), no bytecode caches. Every subprocess runs without a
   shell, with a timeout and an output cap.
5. **R5 Staleness.** The page shows whether the install's generated files match their sources, from
   `render_roles.py --check`, with the problem lines when they don't.
6. **R6 Codex status.** The page shows what `install_codex_agents.py` would do (dry run): installed,
   updates pending, conflicts or blocked, with the destination folder and the apply command as text
   the owner runs.
7. **R7 Propose a change.** From a role (or the list, for a change across roles) the owner writes
   what should change; bb starts a new thread in the bb project whose remote is the team plugin's
   marketplace repo, with the owner's words as the visible message and an agent-only brief naming the
   source files, the regeneration and checks, and the current resolved values.
8. **R8 CLI.** `bb team-roles list [--json]` prints the same list and statuses for agents.
9. **R9 Docs.** The agent skill lives in `plugins/team-roles/skills/team-roles/SKILL.md`; the README is
   for people (repo `AGENTS.md`, «Rules»).
10. **R10 Repo rules.** The plugin builds alone from its folder, imports nothing from another plugin
    or the root, pins `@get-bb/plugin-sdk` 0.6.132 (repo `AGENTS.md`, «Rules»), and is added to the
    repo's indexes.
11. **R11 Failure.** Each failure — team not installed, `python3` missing, a script timing out or
    exiting with an error, `roles.json` unreadable — shows its own named state in the part it
    affects; the rest of the page still renders.
12. **R12 Not published.** No release tag, no marketplace submission.

## Options

### Where it lives in bb

| Option | For | Against |
|---|---|---|
| **A. Nav panel page** (`app.slots.navPanel`) with list and detail | A rail destination of its own; owns its whole route, so `subPath` carries the selected role and the propose page; same shape as `kaiten` and `artifacts` (`docs/plugins.md`) | One more rail item |
| B. Side panel tab | Sits beside a chat | Roles aren't about a thread; a thread-scoped tab shows the same content on every thread and is cramped for a prompt |
| C. Settings section (`app.slots.settingsSection`) | No new rail item | Settings are for configuring this plugin; a list, a detail and a composer don't belong there, and nobody browses settings to read prompts |
| D. Do nothing in the UI | Agents can run `render_roles.py resolve` already | Fails R1, R2, R5–R7: the owner asked to *view* the team in bb |

### How the server gets the data

| Option | For | Against |
|---|---|---|
| **1. Read `roles.json`, run the team's own scripts** in their read-only modes | `roles.json` is the plugin's published table for callers (team `README.md`, «Устройство»); `resolve` is the only source of the prompt the runtime gets, Codex's appended limits included (team `README.md`: «Берите `prompt` из `resolve`, а не текст роли»); `--check` and the installer's dry run are the plugin's own definitions of «stale» and «installed» | Needs `python3`; a subprocess per check |
| 2. Reimplement the generator in TypeScript (parse `roles/*.md` + `adapters/runtimes.json`) | No Python | Duplicates `render_roles.py`'s mapping, validation and Codex prompt suffix; drifts on the next generator change; staleness and Codex status would be our own guesses |
| 3. Read only generated files (`agents/*.md`, `codex/agents/*.toml`) | No subprocess | Needs a TOML parser; can't tell stale from current; Codex status means reimplementing the installer's hash-and-manifest plan |

### How a change is proposed

| Option | For | Against |
|---|---|---|
| **a. A propose page with bb's composer** (`experimental_NewThreadComposer`) and an agent-only brief added on submit | The owner says what to change in their own words; project, model and environment stay pickable; the brief is invisible context, not text the owner must edit; same pattern as github-folder's PR page (`plugins/github-folder/components/PrPage.tsx`) | One page more than a button |
| b. One click spawns a thread from the server (`bb.sdk.threads.spawn` with `prompt`) | Fewest clicks; kaiten does this for cards (`plugins/kaiten/server.ts`, `startCard`) | A Kaiten card *is* the task; a role isn't — the thread would start without knowing what to change and ask, wasting a turn |
| c. Edit in place | What «manage it» might suggest | Excluded by the approved scope: the install is a cache overwritten on update, and the source needs regeneration and checks |

## Recommendation

**A + 1 + a.** A nav panel page whose server reads `roles.json` from the installed `team` plugin and
runs `render_roles.py resolve`/`--check` and `install_codex_agents.py` (dry run only), plus a propose
page that starts a thread in the team source repo's bb project with bb's composer and an agent-only
brief. Option 1 is the only one that shows what the runtimes actually get (R2) and the plugin's own
idea of stale and installed (R5, R6) without copying its logic; option a is the only propose flow in
which the new thread knows both *what* to change (owner's words) and *where and how* (the brief).

## Design

### Package

```
plugins/team-roles/
  package.json            bb-plugin-team-roles; engines bb >=0.49, bbPluginSdk >=0.6.132;
                          devDependency @get-bb/plugin-sdk 0.6.132; dependency zod
  server.ts               settings, RPC, CLI; wires lib/ to node:fs and node:child_process
  app.tsx                 definePluginApp: one navPanel
  lib/locate.ts           findTeamInstall(): which team root to read
  lib/scripts.ts          scriptArgv() allowlist + runScript() (execFile, timeout, cap)
  lib/parse.ts            zod schemas and parsers: roles.json, resolve JSON, --check output,
                          installer plan output
  lib/snapshot.ts         buildSnapshot(): install + roles + generated + codex, from injected readers
  lib/brief.ts            proposalBrief(): the agent-only text; findSourceProject()
  lib/contract.ts         RPC contract as plain schema objects (docs/gotchas.md, «Frontend RPC contracts»)
  lib/view.ts             row labels, status wording, subPath parsing
  components/RolesPage.tsx    the navPanel component: routes on subPath
  components/RoleList.tsx     list + header statuses
  components/RoleDetail.tsx   one role
  components/ProposePage.tsx  context card + NewThreadComposer
  components/ui/          vendored UI, as other plugins here
  icons/team-roles.svg    branding icon (docs/gotchas.md: unknown Lucide names render as a Zap)
  skills/team-roles/SKILL.md
  README.md
  test/*.test.ts          node --test over lib/
```

`lib/` holds every rule as a pure function over injected inputs; `server.ts` and `components/` stay
thin (`docs/workflow.md`, «Seeing it work» → Tests).

### Locating the install (R3)

`findTeamInstall({ claudeDir, settingRoot, readJson, isFile, listDir })` returns
`{ root, version, key, scope, commit, enabled, source, others }` or `{ error }`. `claudeDir` is
`$CLAUDE_CONFIG_DIR` when set, else `~/.claude`. Order:

1. **Setting `teamRoot`** (string, default empty). When set, that folder alone is used,
   `source: "setting"`. For previewing a source checkout such as
   `~/Projects/kartollika-ai-hub/plugins/team` before a release; same idea as orchestration's
   `exportScript` (`plugins/orchestration/src/locate.ts`).
2. **`<claudeDir>/plugins/installed_plugins.json`** (format `version: 2`; read on this Mac): every key
   `team@<marketplace>` in `plugins`, each a list of `{ scope, installPath, version, gitCommitSha,
   projectPath? }`. Take the `scope: "user"` entry; if several marketplaces have one, the one enabled
   in `<claudeDir>/settings.json` `enabledPlugins` wins, then the highest version. The rest go to
   `others` (shown as «also installed: …»). `source: "installed_plugins"`.
3. **Cache scan fallback** when the file is missing or has no `team@` entry: every
   `<claudeDir>/plugins/cache/<marketplace>/team/<version>/` whose version matches `^\d+(\.\d+)*$`,
   newest first by numeric comparison (the same rule as orchestration's `compareVersions`, copied,
   not imported — plugins stay independent). `source: "cache-scan"`, `enabled: null`.

A candidate root is accepted only if it holds `roles.json`, `scripts/render_roles.py` and
`scripts/install_codex_agents.py` as regular files. `enabled` is
`enabledPlugins["team@<marketplace>"]` from the user settings only — project-level overrides are not
read. Only the team entries leave the server; other plugins' entries are never returned.

Rejected: `claude plugin list --json` (what the orchestrator used to check). It spawns the Claude
CLI per refresh, depends on the bb server's `PATH`, and is slower than reading the file the CLI
itself reads.

### Running the scripts safely (R4)

All script runs go through one function:

```ts
type ScriptCall =
  | { kind: "resolve"; role: string; runtime: string }
  | { kind: "check" }
  | { kind: "codex-plan" };

function scriptArgv(root: string, call: ScriptCall): string[]
//   resolve    → ["-B", "-I", <root>/scripts/render_roles.py, "resolve", role, "--runtime", runtime]
//   check      → ["-B", "-I", <root>/scripts/render_roles.py, "--check"]
//   codex-plan → ["-B", "-I", <root>/scripts/install_codex_agents.py]
```

- `role` must match `^[a-z][a-z-]*$` (render_roles.py's own `NAME`) **and** be a key of the parsed
  `roles.json`; `runtime` must be a key of that role's `runtimes`. Anything else is refused before a
  process starts.
- There is no other way to build an argv: no call kind can produce `render_roles.py` without
  `resolve`/`--check` (which *writes* every output — read in `render_roles.py`, `main`) or the
  installer with `--apply`/`--force`. A test asserts this over every call kind.
- `-B` stops Python writing `__pycache__` into the install (the installer imports `render_roles`);
  `-I` ignores `PYTHON*` variables and keeps the current directory off `sys.path`. Both checked: all
  three calls run correctly with `-B -I` on 0.2.0 (the installer adds its own folder to `sys.path`).
- `execFile("python3", argv, { cwd: os.tmpdir(), timeout: 10_000, killSignal: "SIGKILL",
  maxBuffer: 2 MiB, env: process.env })` — no shell. `CODEX_HOME` passes through, because the
  installer's destination depends on it.
- One run per `(root, call)` at a time; concurrent callers share the promise. Results are cached
  until Refresh or until the `mtimeMs` of one of these changes: `roles.json`,
  `installed_plugins.json`, or the Codex destination's `.team-agents.json` (the installer rewrites it
  on every `--apply` that changes anything, so the Codex state follows an apply without a Refresh). A
  missing file counts as `mtimeMs` 0.
- Outputs are untrusted text: parsed with zod (`lib/parse.ts`), length-capped, and rendered as text
  or through bb's `Markdown`; never as HTML.

### Snapshot model

```ts
type Snapshot = {
  install: { root: string; version: string | null; key: string | null; scope: string | null;
             commit: string | null; enabled: boolean | null; source: "setting" | "installed_plugins" | "cache-scan";
             others: string[] } | null;
  installError: string | null;              // "team plugin not found in ~/.claude/plugins" …
  roles: RoleRow[];                         // from roles.json; [] when unreadable
  rolesError: string | null;                // "roles.json: version 2 is not supported" …
  generated: { state: "current" | "stale" | "invalid" | "unknown"; problems: string[]; error: string | null };
  codex: { state: "installed" | "pending" | "conflict" | "not-installed" | "blocked" | "unknown";
           dest: string | null; steps: { action: string; file: string }[]; message: string | null;
           applyCommand: string | null };
  hostId: string | null;                    // (await bb.sdk.system.config()).primaryHostId, for file previews
  checkedAt: number;
};
type RoleRow = {
  name: string; intent: string; tier: string; effort: string;
  access: "read-only" | "edit"; shell: boolean; web: boolean; source: string;   // "roles/<name>.md"
  runtimes: Record<string, { agent: string; model: string; effort: string;
                             disallowed_tools: string[]; features: Record<string, boolean>; unenforced: string[] }>;
};
type RoleDetail = RoleRow & {
  prompts: Record<string, { prompt: string | null; error: string | null;
                            differsFromTable: string[] }>;   // fields where resolve ≠ roles.json
  generatedFiles: string[];   // agents/<name>.md, codex/agents/<agent>.toml
};
```

`roles.json` is parsed with a schema that accepts only `version: 1` (what render_roles.py writes,
`roles_table`). Runtimes come from the file, not from a list in this plugin, so a third runtime added
to `adapters/runtimes.json` appears without a change here.

Both parsers work line by line on a named stream. They recognise the lines below. Any other line
goes into an «other output» list that the expanded status shows. An unrecognised line never
downgrades a result that recognised lines already establish. The test fixtures are the outputs
quoted here, taken from team 0.2.0 on a temporary copy of the install (see «Sources read»).

**Staleness (R5)** from `render_roles.py --check`. It writes nothing to stdout; every line it
prints goes to **stderr** (`render_roles.py`, `main`).

| Exit | stderr lines recognised | State |
|---|---|---|
| 0 | none expected | `current` |
| 1 | one or more of `^missing: (.+)$`, `^stale: (.+)$`, `^not produced by any role: (.+)$`, plus the advice trailer `run scripts/render_roles.py and commit the result` (tolerated, not shown as a problem) | `stale`, with the problem lines |
| 1 | `^error: (.+)$` and no problem line (a role or the adapter doesn't parse) | `invalid`, with the message |
| 1 | neither | `unknown: --check failed without a reason` |
| other, timeout, spawn failure | — | `unknown` with the reason |

Observed on 0.2.0:
- A fresh copy exits 0 with both streams empty.
- With `roles/reviewer.md` edited and a stray `codex/agents/team-ghost.toml`, it exits 1 and prints
  on stderr `stale: agents/reviewer.md`, `stale: codex/agents/team-reviewer.toml`,
  `not produced by any role: codex/agents/team-ghost.toml`, then
  `run scripts/render_roles.py and commit the result`.
- With an unknown tier, it exits 1 and prints on stderr
  `error: claude-code: no tier mapping for runner's 'huge'`.

**Codex status (R6)** from `install_codex_agents.py` with no flags, which is a dry run.

The plan lines are on **stdout** and match `^(install|update|unchanged|remove|forget|conflict|keep)\s+(\S.*)$`.
The file in the last group is a path in the destination folder. stdout also carries the tolerated
trailer `dry run: nothing changed; rerun with --apply`. `applied to …` is the trailer of `--apply`,
which is never passed; it is tolerated too.

**stderr** carries the rest:
- The `keep` summary `edited after install and no role produces them any more, so they stay as
  your own files: <names>` (tolerated; the plan lines already name the files).
- The conflict summary `left alone, edited since install or not written by this script: <names>;
  compare them, then rerun with --force to replace` (tolerated, same reason).
- When the generated files are stale, the `--check` problem lines followed by
  `error: generated files are not current; run scripts/render_roles.py first`.
- Any other `error: …`, such as a manifest the script didn't write.

| Recognised lines | State | Shown |
|---|---|---|
| plan lines, any `conflict` (exit 1) | `conflict` | the file names + «edited since install; compare, then rerun with --force» (the installer's own advice) |
| plan lines, every one `unchanged` (exit 0) | `installed` | «Codex agents: 6 installed, current» |
| plan lines, every one `install` (exit 0) | `not-installed` | «Codex agents not installed» + apply command |
| plan lines, otherwise (exit 0): some `install`/`update`/`remove`/`forget`/`keep` | `pending` | counts per action + apply command; `keep` files with «edited after install, no role produces them; they stay as your own files» |
| no plan lines; stderr has `error: generated files are not current…` | `blocked` | «blocked: generated files are stale» + the problem lines |
| no plan lines; stderr has another `error: …` | `unknown` | that message |
| no plan lines and no `error:` line (an empty plan: the root has no `codex/agents/team-*.toml` and the destination no manifest) | `unknown` | «the installer planned nothing» — never `installed` |
| exit other than 0/1, timeout, spawn failure, or an exit that contradicts the plan (`conflict` with exit 0, exit 1 without `conflict` or `error:`) | `unknown` | the reason |

Observed on 0.2.0:
- Against `~/.codex/agents` it exits 0 with six `unchanged …/team-<role>.toml` lines and the
  `dry run:` trailer; stderr is empty.
- Against an empty `--dest` it exits 0 with six `install` lines and the trailer; it does not create
  the folder.
- Against a `--dest` holding a foreign `team-reviewer.toml` and a manifest that lists an edited
  `team-old.toml` and a missing `team-gone.toml`, it exits 1. stdout has `install` ×5,
  `conflict …/team-reviewer.toml`, `forget …/team-gone.toml`, `keep …/team-old.toml` and the
  trailer; stderr has the two summary lines. The folder's checksums were unchanged afterwards.
- On the stale copy above it exits 1 with no stdout; stderr has the three problem lines and then
  `error: generated files are not current; run scripts/render_roles.py first`.

`dest` is the folder in the plan's paths. `applyCommand` is
`python3 <root>/scripts/install_codex_agents.py --apply` — shown with a Copy button, never run.

### Pages and data sources

Route: the nav panel's `subPath` — `""` the list, `role/<name>` a role, `propose` a change across
roles, `propose/<name>` a change to one role. (`role/` and `propose/` prefixes keep a role that
happens to be called `propose` addressable.) On a wide window the list stays on the left and the
role opens on the right; under 720 px they stack and Back returns to the list.

**List (`subPath ""`)**

```
┌ Team roles ───────────────────────────────────────────────── [Refresh] [Propose a change] ┐
│ team 0.2.0 · team@kartollika-ai-hub · user scope · enabled                         ①      │
│ ~/.claude/plugins/cache/kartollika-ai-hub/team/0.2.0                               ①      │
│ Generated files: ✓ current                                                         ②      │
│ Codex agents: ✓ 6 installed, current — ~/.codex/agents                             ③      │
│                                                                                           │
│ ROLE         CLAUDE CODE       CODEX                 ACCESS                ④              │
│ designer     opus · high       gpt-6.1-sol · high    edit · shell          ④              │
│   Decide the shape of a change — interfaces, data flow, behaviour, UI …    ④              │
│ implementer  sonnet · medium   gpt-6.1-sol · medium  edit · shell                         │
│   Make a change exactly as a complete brief describes it — code, tests …                  │
│ planner      opus · high       gpt-6.1-sol · high    read-only · shell                    │
│ researcher   sonnet · medium   gpt-6.1-sol · medium  read-only · shell · web              │
│ reviewer     opus · high       gpt-6.1-sol · high    read-only · shell                    │
│ runner       sonnet · low      gpt-6.1-sol · low     read-only · shell                    │
│                                                         checked 14:05 ⑤                   │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Element | Source |
|---|---|---|
| ① | version, key, scope, enabled, root, «also installed» | `findTeamInstall`: `installed_plugins.json` entry (`version`, `installPath`, `scope`), `settings.json` `enabledPlugins` |
| ② | generated-files state, problem lines on expand | `render_roles.py --check` |
| ③ | Codex state, destination, counts, apply command | `install_codex_agents.py` (dry run) |
| ④ | role name, intent, per-runtime `model · effort`, access/shell/web | `roles.json` → `roles.<name>.{intent, access, shell, web}`, `roles.<name>.runtimes.<rt>.{model, effort}`; one column per runtime key |
| ⑤ | when the snapshot was taken | server clock at `buildSnapshot` |

Rows sort by role name, as `roles.json` does. A runtime column's header is the runtime key with a
display label for the two known ones (`claude-code` → «Claude Code», `codex` → «Codex»).

**Role detail (`subPath role/<name>`)**

```
┌ ← Roles   reviewer                                                    [Propose a change] ┐
│ Independently review a change against its brief and the project's rules, and return a    │ ①
│ verdict with findings that each show how the code fails; reads and runs checks, edits     │
│ nothing.                                                                                   │
│ tier strongest · effort high · read-only · shell · no web                                  │ ①
│                                                                                            │
│              Claude Code                        Codex                                      │
│ Agent        team:reviewer                      team-reviewer                              │ ②
│ Model        opus                               gpt-6.1-sol                                │ ②
│ Effort       high                               high                                       │ ②
│ Blocked      Edit, Write, NotebookEdit,         —                                          │ ②
│ tools        MultiEdit, Agent, WebFetch,                                                   │
│              WebSearch                                                                     │
│ Features     —                                  —                                          │ ②
│ Not enforced —                                  • must not create, edit or delete files…   │ ②
│ (prompt only)                                   • must not search or read the web…         │
│                                                                                            │
│ Files  roles/reviewer.md (source) · agents/reviewer.md · codex/agents/team-reviewer.toml  │ ③
│                                                                                            │
│ Prompt   [Claude Code] [Codex]                                    [Raw] [Copy]             │ ④
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ You review work you did not write and have no stake in. …                            │ │ ④
│ │ ## Read first …  ## Produce …  ## Check before reporting …  ## Report …              │ │
│ │ (Codex adds: ## Limits this runtime does not enforce)                                │ │
│ └──────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

| # | Element | Source |
|---|---|---|
| ① | intent, tier, effort, access, shell, web | `roles.json` → `roles.<name>` |
| ② | agent, model, effort, disallowed tools, features, unenforced per runtime | `roles.json` → `roles.<name>.runtimes.<rt>`; a field where `resolve` disagrees is marked «differs from source» with the `resolve` value (only possible while ② of the list says stale) |
| ③ | source and generated files, clickable | `roles.<name>.source`; `agents/<name>.md`; `codex/agents/<runtimes.codex.agent>.toml`; opened read-only with `useBbNavigate().experimental_openFilePreview({ target: { kind: "host", hostId, path } })`, `hostId` from the snapshot (docs/gotchas.md, «File preview»); when it returns `false`, the path is copied instead |
| ④ | the prompt per runtime | `render_roles.py resolve <name> --runtime <rt>` → `prompt`; rendered with `Markdown`, Raw shows it as preformatted text; Copy uses `experimental_copyToClipboard({ text })` |

The prompt is fetched for the selected runtime only, when the detail opens.

**States, everywhere they apply**

| Condition | List | Detail |
|---|---|---|
| no install found | empty state: «The team plugin isn't installed for Claude Code» + `claude plugin install team@kartollika-ai-hub` as copyable text | same |
| install found, disabled in user settings | ① shows «disabled»; everything else as normal | — |
| `roles.json` unreadable / unsupported version | error card with the parse message; ② and ③ still shown | error card |
| `python3` missing | roles from `roles.json` as normal; ② and ③ `unknown: python3 not found` | prompt area: same message |
| script timeout | the part it feeds: `unknown: timed out after 10 s` | prompt area: same |
| role name not in `roles.json` (stale link) | — | «No role `<name>` in team <version>» + link to the list |

### Propose a change (R7)

**Page.** `subPath propose/<name>` (or `propose`): a context card — role, installed version, the
source repo and the project the thread will start in — above bb's composer:

```tsx
<NewThreadComposer
  defaultProjectId={proposal.projectId ?? undefined}
  placeholder={role ? `What should change in the ${role} role?` : "What should change in the team?"}
  draftKey={`team-roles:propose:${role ?? "*"}`}
  focusRequest={1}
  onSubmit={async (request) => {
    const { brief } = await rpc.call("proposal", { role });
    const thread = await sdk.threads.spawn({
      ...request,
      title: role ? `team: change the ${role} role` : "team: change the roles",
      input: [...request.input, { type: "text", text: brief, mentions: [], visibility: "agent-only" }],
      pluginMetadata: { teamRole: role, teamVersion: snapshot.install?.version ?? null },
    });
    navigate.toThread(thread.id);
  }}
/>
```

The brief is fetched at submit, not cached from page load, so it carries the values current at that
moment. A failed spawn throws, and the composer keeps the draft (`NewThreadComposerProps.onSubmit`
doc comment).

**Which project.** `findSourceProject(marketplaceUrl, projects)`: the marketplace of the chosen
install (`team@<marketplace>`) has a `source` in `<claudeDir>/plugins/known_marketplaces.json`
(`{ source: "git", url }` or `{ source: "github", repo }`). Both normalise to `host/owner/repo`
(lower case, no `.git`, no scheme or `git@`), and so does each `bb.sdk.projects.list()` item's
`gitRemoteUrl`. The first match is the default project; on Dmitrii's Mac that is the
`kartollika-ai-hub` project. No match (or `source: "setting"`/`"cache-scan"` without a marketplace
entry) → no default; the card says «No bb project for <repo>; pick one below», and the composer's
project picker stays open. The project id is never hard-coded.

**The brief** (`proposalBrief({ role, install, roles, generated })`, a pure function; the agent-only
text, starting with a tag the receiving agent and the skill can recognise):

```
[team-roles] The owner wants to change the `team` plugin's <`reviewer` role | roles>. Their
request is the message above; this part is context from the Team roles page in bb.

Installed: team 0.2.0 (team@kartollika-ai-hub, commit 4451618). Generated files: current.

Where the role is defined, in this repository:
- plugins/team/roles/reviewer.md — the source: frontmatter (intent, tier, effort, access, shell,
  web) and the process text. Edit by hand.
- plugins/team/adapters/runtimes.json — models, efforts and tool limits per runtime; the only file
  that names a provider, model or runtime tool.
- Generated, never edited by hand: plugins/team/agents/reviewer.md,
  plugins/team/codex/agents/team-reviewer.toml, plugins/team/roles.json.

What it resolves to now:
- claude-code: team:reviewer, opus / high; blocked tools Edit, Write, NotebookEdit, MultiEdit,
  Agent, WebFetch, WebSearch
- codex: team-reviewer, gpt-6.1-sol / high; not enforced by the runtime: no editing, no web

Before you change it:
- Read the repository's README (section «Разработка»), plugins/team/README.md and
  plugins/team/docs/design.md; a change to a decision recorded there updates that record.
- A request that only concerns one project belongs in that project's AGENTS.md or CLAUDE.md, which
  every role reads first — not in the role. Say so if that is what this is.
- Never edit the installed copy under ~/.claude/plugins/cache; it is replaced on update.

After the change: regenerate with render_roles.py and run the checks the README lists for team
(test_render_roles.py, test_install_codex_agents.py, check_neutral_roles.py, render_roles.py
--check). The installed copy only changes after a version bump and an update, and Codex agents
after install_codex_agents.py --apply — leave both to the owner and list them in your report.
```

Values in angle brackets and the «now» block come from the snapshot; with no role, the source line
reads `plugins/team/roles/<role>.md` and the «now» block lists every role on one line each. The
source paths are the layout of the hub repo (`git ls-tree origin/main plugins/team`), stated as
relative paths because the thread runs in that repo's checkout. The brief carries no local
absolute path except the cache folder written with `~`.

### RPC contract

Plain schema objects in `lib/contract.ts` (docs/gotchas.md, «Frontend RPC contracts»):

| Method | Input | Output | Tags |
|---|---|---|---|
| `snapshot` | `null` | `Snapshot` | `["snapshot"]` |
| `role` | `{ name: string }` (regex `^[a-z][a-z-]*$`, max 64) | `RoleRow & { generatedFiles: string[] }`, or a not-found error | `["snapshot"]` |
| `prompt` | `{ name, runtime }` (both regex-checked, then checked against `roles.json`) | `{ prompt: string \| null, error: string \| null, differsFromTable: string[] }` | `["snapshot"]` |
| `refresh` | `null` | `Snapshot` (cache dropped, scripts rerun) | — then `bb.rpc.experimental_invalidate(["snapshot"])` |
| `proposal` | `{ role: string \| null }` | `{ projectId: string \| null, projectName: string \| null, repo: string \| null, brief: string }` | — |

Prompts come through `prompt`, one runtime per call, so the detail opens before the subprocess
finishes; the page assembles `RoleDetail` from `role` and `prompt`.

### CLI (R8)

`bb.cli.register({ name: "team-roles", summary: "Show the team plugin's agent roles", commands: [{
name: "list", summary: "List roles with model and effort per runtime, plus generated-file and Codex
status", usage: "bb team-roles list [--json]" }], run })`.

- `list` prints:
  ```
  team 0.2.0 (team@kartollika-ai-hub, user scope, enabled)
  root: ~/.claude/plugins/cache/kartollika-ai-hub/team/0.2.0
  generated files: current
  codex agents: installed, current (~/.codex/agents)

  ROLE         CLAUDE-CODE       CODEX                 ACCESS
  designer     opus/high         gpt-6.1-sol/high      edit, shell
  …
  ```
  Exit 0 when the install was found and `roles.json` parsed; 1 otherwise, with the reason on stderr.
- `list --json` prints the `Snapshot` as one JSON object (no prompts; a few KB, far under
  `PLUGIN_CLI_OUTPUT_MAX_BYTES`).
- Anything else, `help` or `--help` → the usage line, exit 0 for help and 1 for an unknown command
  (kaiten's pattern, `plugins/kaiten/server.ts`). Command names match `[a-z0-9-]+`
  (docs/gotchas.md, «CLI subcommand names»).
- No `show` command: an agent that needs a prompt runs `render_roles.py resolve`, whose path `list`
  prints. The skill says so.

### Settings

One: `teamRoot` (`type: "string"`, label «Team plugin folder», default `""`, description «Leave empty
to use the installed plugin. Set a folder such as a source checkout of plugins/team to read that
instead.»). The page shows `source: setting` in ① when it is in effect.

### Agent skill and README (R9)

`skills/team-roles/SKILL.md`: when to use it (the user asks which roles exist, which model or effort
a role runs at, whether team or its Codex agents are current, or wants to change a role); the `list`
command and its JSON fields; that the plugin is read-only and never runs `--apply`, `render_roles.py`
without a subcommand, or a plugin update; that a role changes in the hub repo through the Propose a
change page (or by the same brief) and never in the cache; that per-project additions go into the
project's `AGENTS.md`/`CLAUDE.md`; what a `[team-roles]` agent-only message is. `README.md`: the same
for people, with the page described. No `PLUGIN_OVERVIEW.md` until publication (R12).

### Failure behaviour

- Every reader returns a value or a named error; `buildSnapshot` never throws. The RPC handlers
  therefore always answer, and the page renders whatever parts succeeded (R11).
- A script that exceeds 10 s is killed (`SIGKILL`) and reported; the next Refresh retries.
- Output over 2 MiB fails that call as `unknown: output too large`.
- The cache is per server instance and dropped on dispose (`bb.onDispose`); there is no background
  service, so a reload has nothing to stop.

### Migration

Nothing exists to migrate: there is no earlier plugin, and nothing in the team plugin changes. The
plugin depends on the team plugin's file layout and its scripts' interfaces as of 0.2.0
(`roles.json` `version: 1`; `resolve` JSON keys `role, runtime, agent, model, effort,
disallowed_tools, features, unenforced, prompt`; `--check` line prefixes; the installer's plan line
format). A change there shows up as `invalid`/`unknown` states, not as wrong data, because every
parser is strict. The tests carry fixtures copied from 0.2.0's real output.

## What it does not cover

- **Editing** roles, prompts or the adapter from bb, and per-project prompt additions: out of the
  approved v1 scope; the change goes through the proposed thread.
- **Role usage per thread** (which threads or subagents ran as which role): out of v1 (approved
  scope). It would need bb's timeline subagent rows or orchestrate ledgers.
- **Running** `install_codex_agents.py --apply`, `claude plugin update`, or `render_roles.py` to
  regenerate: the owner's steps; the page shows the command.
- **Project- or local-scope installs** of team as the main view: they are listed in «also installed»;
  only the user-scope install is read. Project-level `enabledPlugins` overrides are not read.
- **Live refresh** on file change: Refresh and the mtime check cover v1.
- **Codex-only machines** (Codex agents without a Claude Code install): the plugin needs the Claude
  Code install to find `roles.json` and the scripts, unless `teamRoot` points at a checkout.
- **Publication** (R12).

## Implementation slice I3

**Areas:** `plugins/team-roles/**` (new); `.bb/plugins.json`, `README.md` (plugin table),
`docs/plugins.md` (new section), `docs/publication.md` (row: no public tag, not submitted). Not
`marketplace.json` or `icons/` — see Q1. Commits: one for the plugin, one for the repo-wide indexes
and docs (repo `AGENTS.md`, «One commit touches one plugin»).

**Done when:**

1. `npm test`, `npm run typecheck` and `bb plugin build` pass in `plugins/team-roles`, and the tests
   cover: install lookup (setting, `installed_plugins.json` with several marketplaces and scopes,
   cache-scan fallback, missing files), `scriptArgv` refusing every argv that could write (a test per
   call kind plus invalid role and runtime names, with a deliberately broken control), the three
   output parsers on 0.2.0 fixtures plus stale, conflict, blocked and garbage cases, `findSourceProject`
   URL normalisation, and `proposalBrief` for one role and for none.
2. With the plugin reloaded, the Team roles page in the running bb shows the six roles with both
   runtimes' model and effort, «Generated files: current» and the Codex state the dry run gives; the
   reviewer detail shows its blocked tools and Codex's unenforced limits and both prompts — checked by
   eye, or the check handed to Dmitrii with steps if it can't be seen.
3. `bb team-roles list` and `bb team-roles list --json` print the same roles and statuses; with
   `teamRoot` pointed at an empty folder the page and the CLI show the not-found state and the CLI
   exits 1.
4. Propose a change on `reviewer`, submitted with a short request, opens a new thread in the
   `kartollika-ai-hub` project whose first message shows only the owner's words and whose agent-only
   part is the brief with reviewer's current values.
5. A before/after record of the team install folder and `~/.codex/agents` (file list with checksums)
   around steps 2–4 is identical: nothing was written.

## Open questions for the owner

1. **`marketplace.json` for an unpublished plugin.** Repo `AGENTS.md` says a new plugin goes into
   `plugins/`, `.bb/plugins.json` *and* `marketplace.json` with an icon; the unpublished `kaiten`,
   `orchestration` and `task-stop` are in neither `marketplace.json` nor `icons/`
   (`docs/plugins.md`, `docs/publication.md`), and adding to the self-hosted catalog makes the plugin
   installable from it. Options: (a) leave it out like kaiten until you approve publication;
   (b) add it now. **Recommendation: (a)**, and record the precedent in `AGENTS.md` in the same
   change.
2. **The `teamRoot` setting.** Options: (a) keep it, so a role change can be previewed from a source
   checkout before release; (b) drop it, the page only ever reads the installed plugin.
   **Recommendation: (a)**: it costs one setting and makes the staleness check useful while editing
   roles.
3. **Propose flow.** Options: (a) composer page where you write the request, brief added agent-only
   (this design); (b) one click starts the thread with the brief only, and the agent asks what to
   change. **Recommendation: (a)**: the thread starts with the request, so its first turn is work,
   not a question.
4. **Rail label.** «Team roles» (this design) or «Team». **Recommendation: «Team roles»**: «Team» alone
   reads like people or a bb workspace.

## Sources read

- This repo: `AGENTS.md`, `README.md`, `docs/plugins.md`, `docs/workflow.md`, `docs/gotchas.md`,
  `docs/publication.md`, `.bb/plugins.json`, `marketplace.json`; `plugins/kaiten/{server.ts,
  app.tsx, lib/contract.ts, package.json}`; `plugins/github-folder/components/PrPage.tsx`;
  `plugins/orchestration/src/locate.ts`, `plugins/orchestration/server.ts` (script runner);
  `plugins/thread-tree/package.json`.
- team 0.2.0 install: `README.md`, `docs/design.md`, `.claude-plugin/plugin.json`,
  `adapters/runtimes.json`, `roles/reviewer.md`, `roles.json`, `agents/runner.md`,
  `scripts/render_roles.py`, `scripts/install_codex_agents.py`. Ran, read-only:
  `render_roles.py resolve reviewer --runtime claude-code` and `--runtime codex`, `resolve nope`
  (exit 1, `error: unknown role`), `--check` (exit 0), `install_codex_agents.py` (dry run: six
  `unchanged`, exit 0), each with `python3 -B -I`.
- Claude Code state: `~/.claude/plugins/installed_plugins.json`, `known_marketplaces.json`,
  `~/.claude/settings.json` (`enabledPlugins`).
- Hub repo `origin/main`: `README.md` («Разработка»), `.claude-plugin/marketplace.json`, the file
  list of `plugins/team`.

## SDK surfaces used

Checked against `@get-bb/plugin-sdk` 0.6.132's declarations (`bundled-types/bb-plugin-sdk.d.ts` and
`bundled-types/bb-plugin-sdk-app.d.ts` in `plugins/kaiten/node_modules/@get-bb/plugin-sdk/` of the
main checkout, `package.json` version 0.6.132) and the `bb-plugin-authoring` references shipped with
bb 0.49.0 (`<bb.app>/Contents/Resources/app.asar.unpacked/node_modules/bb-app/server/dist/builtin-skills/bb-plugin-authoring/references/`).

| Surface | Used for | Declaration (0.6.132) | Reference |
|---|---|---|---|
| `bb.settings.define` | `teamRoot` | `bb-plugin-sdk.d.ts:19822` | `backend-foundation.md:47` |
| `bb.rpc.register` | the contract above | `bb-plugin-sdk.d.ts:20511` | `backend-events.md:379` («bb.rpc») |
| `bb.rpc.experimental_invalidate` | after Refresh | `bb-plugin-sdk.d.ts:20496` | `backend-events.md:379` |
| `bb.cli.register` (`PluginCliRegistration`) | `bb team-roles list` | `bb-plugin-sdk.d.ts:20635` | `backend-cli-agents.md:3` |
| `PLUGIN_CLI_OUTPUT_MAX_BYTES` | output bound | `bb-plugin-sdk.d.ts:20619` | `backend-cli-agents.md:107` |
| `bb.sdk.projects.list` (items carry `gitRemoteUrl`) | the source project | `bb-plugin-sdk.d.ts:4190` (`projectSchema`) | `backend-sdk.md:12` |
| `bb.sdk.system.config()` → `primaryHostId` | file preview target | `bb-plugin-sdk.d.ts:18694` (async), field `:11024` | `docs/gotchas.md` «File preview» |
| `bb.onDispose` | drop the cache | `bb-plugin-sdk.d.ts:21748` | `backend-foundation.md:10` |
| `bb.branding.experimental_icons` | rail icon | `bb-plugin-sdk.d.ts:20715` | `quickstart.md:97` |
| `definePluginApp`, `app.slots.navPanel`, `PluginNavPanelProps.subPath` | the page and its routes | `bb-plugin-sdk-app.d.ts:22590`, `:19230`, `:20038` | `frontend-core-slots.md:87` |
| `experimental_useRpcQuery`, `useRpc` | data in the page | `bb-plugin-sdk-app.d.ts:24691`, `:24705` | `frontend-api-index.md:34`, `frontend-hooks-and-ui.md:21` |
| `useSdk().threads.spawn` (`input` with `visibility: "agent-only"`, `title`, `pluginMetadata`) | Propose a change | `bb-plugin-sdk-app.d.ts:19097`; `createThreadRequestSchema` `bb-plugin-sdk.d.ts:12749` (`title`, `pluginMetadata`, `input[].visibility`) | `backend-sdk.md:236`, `frontend-hooks-and-ui.md:5` |
| `experimental_NewThreadComposer` (`defaultProjectId`, `placeholder`, `draftKey`, `focusRequest`, `onSubmit`) | propose page | `bb-plugin-sdk-app.d.ts:23547`, `:24674` | `frontend-components.md:239` |
| `useBbNavigate().toThread`, `.toPluginPanel`, `.experimental_openFilePreview` | open the new thread, route, open files | `bb-plugin-sdk-app.d.ts:23871`, `:23882`, `:23917` | `frontend-hooks-and-ui.md:50`, `frontend-core-slots.md:94` |
| `Markdown` | the prompt | `bb-plugin-sdk-app.d.ts:24671` | `frontend-components.md:184` |
| `experimental_copyToClipboard` | Copy prompt / command | `bb-plugin-sdk-app.d.ts:24768` | `frontend-hooks-and-ui.md:166` |
