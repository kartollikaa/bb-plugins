import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GITHUB_QUERY, mergeAccounts, parseSearch, type GithubPr } from "./github";
import { PR_VIEW_FIELDS, parsePrUrl, parsePrView, signedImages, type PrDetails } from "./pr-context";

const GH_TIMEOUT_MS = 20_000;
const CACHE_MS = 60_000;
const FORCE_DEBOUNCE_MS = 2_000;

/** The default gh login first, then every extra `~/.config/gh-*` profile. */
export function ghConfigDirs(configRoot = join(homedir(), ".config")): (string | null)[] {
  let extra: string[] = [];
  try {
    extra = readdirSync(configRoot)
      .filter((name) => name.startsWith("gh-") && existsSync(join(configRoot, name, "hosts.yml")))
      .sort()
      .map((name) => join(configRoot, name));
  } catch {
    extra = [];
  }
  return [null, ...extra];
}

function ghBinary(): string {
  return ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"].find((path) => existsSync(path)) ?? "gh";
}

function runGh(args: string[], configDir: string | null): Promise<string> {
  const env: NodeJS.ProcessEnv = { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  if (configDir !== null) env.GH_CONFIG_DIR = configDir;
  return new Promise((resolve, reject) => {
    execFile(ghBinary(), args, { env, timeout: GH_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split("\n")[0] || "gh failed"));
      else resolve(stdout);
    });
  });
}

export interface GithubSnapshot {
  accounts: string[];
  prs: GithubPr[];
  /** Set when no account could be read. */
  error: string | null;
  fetchedAt: number;
}

async function fetchAll(): Promise<GithubSnapshot> {
  const results = await Promise.allSettled(
    ghConfigDirs().map(async (dir) => parseSearch(JSON.parse(await runGh(["api", "graphql", "-f", `query=${GITHUB_QUERY}`], dir)).data)),
  );
  const seen = new Set<string>();
  const lists: GithubPr[][] = [];
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      continue;
    }
    if (seen.has(result.value.login)) continue;
    seen.add(result.value.login);
    lists.push(result.value.prs);
  }
  return {
    accounts: [...seen],
    prs: mergeAccounts(lists),
    error: lists.length === 0 ? (errors[0] ?? "gh is not signed in") : null,
    fetchedAt: Date.now(),
  };
}

/** One fetch in flight at a time; reads within a minute reuse the last answer. */
export function createGithubFolder() {
  let last: { at: number; value: Promise<GithubSnapshot> } | null = null;
  return {
    read(force: boolean): Promise<GithubSnapshot> {
      if (last && Date.now() - last.at < (force ? FORCE_DEBOUNCE_MS : CACHE_MS)) return last.value;
      const value = fetchAll();
      last = { at: Date.now(), value };
      value.catch(() => {
        if (last?.value === value) last = null;
      });
      return value;
    },
  };
}

/** Asset id → signed URL of the images in a PR's description; GitHub signs them for five minutes. */
export async function viewPrImages(url: string): Promise<Record<string, string>> {
  const target = parsePrUrl(url);
  if (target === null) return {};
  let lastError: unknown = new Error("gh is not signed in");
  for (const dir of ghConfigDirs()) {
    try {
      const path = `repos/${target.repo}/pulls/${target.number}`;
      return signedImages(await runGh(["api", path, "-H", "Accept: application/vnd.github.full+json", "-q", ".body_html"], dir));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** One PR's details, read with the first gh login that can see it. */
export async function viewPr(url: string): Promise<PrDetails> {
  let lastError: unknown = new Error("gh is not signed in");
  for (const dir of ghConfigDirs()) {
    try {
      return parsePrView(JSON.parse(await runGh(["pr", "view", url, "--json", PR_VIEW_FIELDS.join(",")], dir)));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
