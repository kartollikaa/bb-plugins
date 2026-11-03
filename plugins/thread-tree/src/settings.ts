import { z } from "zod";

const limit = z.number().int().min(1).max(50);

export const SETTINGS = {
  showGithub: {
    type: "boolean",
    label: "Show the GitHub section",
    description: "Pull requests that need you, read from the GitHub Folder plugin.",
    default: true,
  },
  showAutomations: {
    type: "boolean",
    label: "Show the Automations section",
    default: true,
  },
  showRecent: {
    type: "boolean",
    label: "Show Recent Activity",
    default: true,
  },
  recentLimit: {
    type: "number",
    label: "Recent Activity rows",
    description: "Rows shown before Show more.",
    experimental_schema: limit,
    default: 5,
  },
  recentMoreLimit: {
    type: "number",
    label: "Recent Activity rows after Show more",
    experimental_schema: limit,
    default: 15,
  },
  showProviderIcon: {
    type: "boolean",
    label: "Show the agent provider icon",
    description: "A small mark after each title for the provider the thread runs on.",
    default: true,
  },
  showSubagents: {
    type: "boolean",
    label: "Show provider subagent counters",
    default: true,
  },
  showAge: {
    type: "boolean",
    label: "Show the time since the last update",
    default: true,
  },
} as const;

export const SIDEBAR_SECTIONS = [
  { key: "showGithub", label: "GitHub", icon: "Github" },
  { key: "showAutomations", label: "Automations", icon: "Zap" },
  { key: "showRecent", label: "Recent Activity", icon: "Clock" },
] as const;

export type SectionKey = (typeof SIDEBAR_SECTIONS)[number]["key"];

export const sectionPatchSchema = z
  .object({ showGithub: z.boolean(), showAutomations: z.boolean(), showRecent: z.boolean() })
  .partial()
  .strict();

export type ViewSettings = {
  showGithub: boolean;
  showAutomations: boolean;
  showRecent: boolean;
  recentLimit: number;
  recentMoreLimit: number;
  showProviderIcon: boolean;
  showSubagents: boolean;
  showAge: boolean;
};

const DEFAULTS: ViewSettings = Object.fromEntries(
  Object.entries(SETTINGS).map(([key, descriptor]) => [key, descriptor.default]),
) as ViewSettings;

/** Frontend values are untrusted: anything missing or of the wrong type falls back to its default. */
export function readViewSettings(values: Record<string, unknown> | undefined): ViewSettings {
  const bool = (key: keyof ViewSettings) => (typeof values?.[key] === "boolean" ? (values[key] as boolean) : (DEFAULTS[key] as boolean));
  const count = (key: "recentLimit" | "recentMoreLimit") => {
    const parsed = limit.safeParse(values?.[key]);
    return parsed.success ? parsed.data : DEFAULTS[key];
  };
  const recentLimit = count("recentLimit");
  return {
    showGithub: bool("showGithub"),
    showAutomations: bool("showAutomations"),
    showRecent: bool("showRecent"),
    recentLimit,
    recentMoreLimit: Math.max(recentLimit, count("recentMoreLimit")),
    showProviderIcon: bool("showProviderIcon"),
    showSubagents: bool("showSubagents"),
    showAge: bool("showAge"),
  };
}
