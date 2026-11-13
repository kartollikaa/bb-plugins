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
  foldOnDrag: {
    type: "boolean",
    label: "Fold folders while dragging",
    description: "Dragging a section or project folds every block to its header and opens them again on drop.",
    default: true,
  },
  reduceMotion: {
    type: "boolean",
    label: "Reduce motion",
    description: "Folders open and close, blocks reorder and row actions appear without animation, and status spinners hold still.",
    default: false,
  },
} as const;

/** In default display order. */
export const SIDEBAR_SECTIONS = [
  { id: "github", key: "showGithub", label: "GitHub", icon: "Github" },
  { id: "automations", key: "showAutomations", label: "Automations", icon: "Zap" },
  { id: "recent", key: "showRecent", label: "Recent Activity", icon: "Clock" },
] as const;

export type SectionKey = (typeof SIDEBAR_SECTIONS)[number]["key"];
export type SectionId = (typeof SIDEBAR_SECTIONS)[number]["id"];

/** The saved order with unknown and repeated ids dropped, then any section it misses in default order. */
export function resolveSectionOrder(saved: readonly string[]): SectionId[] {
  const known: readonly string[] = SIDEBAR_SECTIONS.map((section) => section.id);
  const kept = saved.filter((id, index): id is SectionId => known.includes(id) && saved.indexOf(id) === index);
  return [...kept, ...SIDEBAR_SECTIONS.map((section) => section.id).filter((id) => !kept.includes(id))];
}

/** The ids in `order` that are present and turned on in `view`. */
export function shownSectionIds(order: readonly SectionId[], view: Pick<ViewSettings, SectionKey>, present: readonly SectionId[]): SectionId[] {
  return order.filter((id) => present.includes(id) && view[SIDEBAR_SECTIONS.find((section) => section.id === id)!.key]);
}

/** `order` with `id` swapped one step toward the top (-1) or bottom (+1) among the `shown` ids. */
export function moveSection(order: readonly SectionId[], shown: readonly SectionId[], id: SectionId, step: -1 | 1): SectionId[] {
  const visible = order.filter((entry) => shown.includes(entry));
  const neighbor = visible[visible.indexOf(id) + step];
  if (!neighbor || !visible.includes(id)) return [...order];
  return order.map((entry) => (entry === id ? neighbor : entry === neighbor ? id : entry));
}

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
  foldOnDrag: boolean;
  reduceMotion: boolean;
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
    foldOnDrag: bool("foldOnDrag"),
    reduceMotion: bool("reduceMotion"),
  };
}
