import { z } from "zod";
import type { InstallInfo } from "./schema.ts";

export type LocateDeps = {
  claudeDir: string;
  settingRoot: string;
  /** Parsed JSON, or null when the file is missing or unreadable. */
  readJson(path: string): Promise<unknown>;
  isFile(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
};

export type Located = InstallInfo | { error: string };

const REQUIRED = ["roles.json", "scripts/render_roles.py", "scripts/install_codex_agents.py"];

const installedSchema = z.object({
  plugins: z.record(
    z.string(),
    z.array(
      z.object({
        scope: z.string(),
        installPath: z.string(),
        version: z.string().optional(),
        gitCommitSha: z.string().optional(),
      }),
    ),
  ),
});

const VERSION = /^\d+(\.\d+)*$/;

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function marketplaceOf(key: string | null): string | null {
  if (key === null) return null;
  const at = key.indexOf("@");
  return at === -1 ? null : key.slice(at + 1);
}

async function hasRoot(deps: LocateDeps, root: string): Promise<boolean> {
  for (const file of REQUIRED) if (!(await deps.isFile(`${root}/${file}`))) return false;
  return true;
}

async function manifestVersion(deps: LocateDeps, root: string): Promise<string | null> {
  const manifest = z.object({ version: z.string() }).safeParse(await deps.readJson(`${root}/.claude-plugin/plugin.json`));
  return manifest.success ? manifest.data.version : null;
}

export async function findTeamInstall(deps: LocateDeps): Promise<Located> {
  const setting = deps.settingRoot.trim();
  if (setting !== "") {
    if (!(await hasRoot(deps, setting))) {
      return { error: `Setting teamRoot (${setting}) has no ${REQUIRED.join(", ")}` };
    }
    return {
      root: setting,
      version: await manifestVersion(deps, setting),
      key: null,
      scope: null,
      commit: null,
      enabled: null,
      source: "setting",
      others: [],
    };
  }

  const installed = installedSchema.safeParse(await deps.readJson(`${deps.claudeDir}/plugins/installed_plugins.json`));
  const entries = installed.success
    ? Object.entries(installed.data.plugins).filter(([key]) => key.startsWith("team@") && key.length > 5)
    : [];
  if (entries.length > 0) {
    const settings = z
      .object({ enabledPlugins: z.record(z.string(), z.boolean()).optional() })
      .safeParse(await deps.readJson(`${deps.claudeDir}/settings.json`));
    const enabledPlugins = settings.success ? (settings.data.enabledPlugins ?? {}) : {};
    const candidates: { key: string; entry: (typeof entries)[number][1][number] }[] = [];
    const labels: { key: string; label: string }[] = [];
    for (const [key, list] of entries) {
      for (const entry of list) {
        labels.push({ key, label: `${key} ${entry.version ?? "?"} (${entry.scope} scope)` });
        if (entry.scope === "user" && (await hasRoot(deps, entry.installPath))) candidates.push({ key, entry });
      }
    }
    if (candidates.length === 0) {
      return {
        error: `team is installed (${labels.map((label) => label.label).join(", ")}) but not for the user scope, or its folder is incomplete. Install it for the user scope or set teamRoot.`,
      };
    }
    candidates.sort((a, b) => {
      const enabled = Number(enabledPlugins[b.key] === true) - Number(enabledPlugins[a.key] === true);
      return enabled !== 0 ? enabled : compareVersions(b.entry.version ?? "0", a.entry.version ?? "0");
    });
    const chosen = candidates[0];
    if (chosen === undefined) return { error: "team plugin not found" };
    const chosenLabel = `${chosen.key} ${chosen.entry.version ?? "?"} (${chosen.entry.scope} scope)`;
    return {
      root: chosen.entry.installPath,
      version: chosen.entry.version ?? (await manifestVersion(deps, chosen.entry.installPath)),
      key: chosen.key,
      scope: chosen.entry.scope,
      commit: chosen.entry.gitCommitSha ?? null,
      enabled: enabledFlag(enabledPlugins, chosen.key),
      source: "installed_plugins",
      others: labels.map((label) => label.label).filter((label) => label !== chosenLabel),
    };
  }

  const cache = `${deps.claudeDir}/plugins/cache`;
  const found: { marketplace: string; version: string; root: string }[] = [];
  for (const marketplace of await deps.listDir(cache)) {
    for (const version of await deps.listDir(`${cache}/${marketplace}/team`)) {
      const root = `${cache}/${marketplace}/team/${version}`;
      if (VERSION.test(version) && (await hasRoot(deps, root))) found.push({ marketplace, version, root });
    }
  }
  found.sort((a, b) => compareVersions(b.version, a.version));
  const [best, ...rest] = found;
  if (best === undefined) return { error: `team plugin not found in ${deps.claudeDir}/plugins` };
  return {
    root: best.root,
    version: best.version,
    key: `team@${best.marketplace}`,
    scope: null,
    commit: null,
    enabled: null,
    source: "cache-scan",
    others: rest.map((other) => `team@${other.marketplace} ${other.version}`),
  };
}

function enabledFlag(enabledPlugins: Record<string, boolean>, name: string): boolean | null {
  return name in enabledPlugins ? enabledPlugins[name] === true : null;
}
