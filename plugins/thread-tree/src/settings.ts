import { z } from "zod";

const limit = z.number().int().min(1).max(50);
const inactiveHours = z.number().int().min(0).max(8760);

export const SETTINGS = {
  showGithub: {
    type: "boolean",
    label: "Show the Pull requests section",
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
    description: "Off by default: the status line filters and Needs you cover it.",
    default: false,
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
  needsYouPullRequests: {
    type: "select",
    label: "Pull requests in Needs you",
    description: "Linked: PRs of your threads with failing checks, conflicts or changes requested. All: every GitHub Folder item. None: no PRs.",
    options: ["linked", "all", "none"] as string[],
    experimental_optionLabels: { linked: "Linked to my threads", all: "All GitHub Folder items", none: "None" },
    default: "linked",
  },
  providerIconStyle: {
    type: "select",
    label: "Provider icon colour",
    description: "Each row shows the provider it runs on before the age: in the provider's brand tint, or in the text colour.",
    options: ["tint", "monochrome"] as string[],
    experimental_optionLabels: { tint: "Brand tint", monochrome: "Monochrome" },
    default: "tint",
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
  hideInactiveProjectsAfterHours: {
    type: "number",
    label: "Hide project folders inactive for (hours)",
    description: "A folder whose threads all stayed quiet this long moves into an \"N inactive projects\" fold at the bottom. Running, waiting, asking, failed or pinned threads keep it. 0 turns hiding off.",
    experimental_schema: inactiveHours,
    default: 24,
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

const reviewModel = z.string().max(200);
const REVIEW_REASONING_LEVELS = ["default", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Read by the server only, so they stay out of the sidebar's view settings. */
export const REVIEW_SETTINGS = {
  reviewModel: {
    type: "string",
    label: "Model for PR review",
    description: "The model an agent review of a pull request runs on, such as claude-opus-5-5. Blank, or a model no available provider offers, uses the project's default model.",
    experimental_schema: reviewModel,
    default: "claude-opus-5-5",
  },
  reviewReasoningLevel: {
    type: "select",
    label: "Reasoning level for PR review",
    description: "Model default, or a level the model doesn't support, uses the model's own default.",
    options: REVIEW_REASONING_LEVELS as string[],
    experimental_optionLabels: { default: "Model default", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" },
    default: "medium",
  },
} as const;

export type ReviewSettings = { reviewModel: string; reviewReasoningLevel: string };

/** Stored values are trusted less than their schema: anything off-type falls back to the default. */
export function readReviewSettings(values: Record<string, unknown> | undefined): ReviewSettings {
  const model = reviewModel.safeParse(values?.reviewModel);
  const level = values?.reviewReasoningLevel;
  return {
    reviewModel: model.success ? model.data : REVIEW_SETTINGS.reviewModel.default,
    reviewReasoningLevel: typeof level === "string" && REVIEW_REASONING_LEVELS.includes(level) ? level : REVIEW_SETTINGS.reviewReasoningLevel.default,
  };
}

/** In default display order. */
export const SIDEBAR_SECTIONS = [
  { id: "github", key: "showGithub", label: "Pull requests", icon: "Github" },
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

export type ProviderIconStyle = "tint" | "monochrome";
export type NeedsYouPullRequests = "linked" | "all" | "none";

export type ViewSettings = {
  showGithub: boolean;
  showAutomations: boolean;
  showRecent: boolean;
  recentLimit: number;
  recentMoreLimit: number;
  needsYouPullRequests: NeedsYouPullRequests;
  providerIconStyle: ProviderIconStyle;
  showSubagents: boolean;
  showAge: boolean;
  hideInactiveProjectsAfterHours: number;
  foldOnDrag: boolean;
  reduceMotion: boolean;
};

const DEFAULTS: ViewSettings = Object.fromEntries(
  Object.entries(SETTINGS).map(([key, descriptor]) => [key, descriptor.default]),
) as ViewSettings;

/** Frontend values are untrusted: anything missing or of the wrong type falls back to its default. */
export function readViewSettings(values: Record<string, unknown> | undefined): ViewSettings {
  const bool = (key: Exclude<keyof ViewSettings, "providerIconStyle" | "needsYouPullRequests" | "hideInactiveProjectsAfterHours">) => (typeof values?.[key] === "boolean" ? (values[key] as boolean) : (DEFAULTS[key] as boolean));
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
    needsYouPullRequests: values?.needsYouPullRequests === "all" || values?.needsYouPullRequests === "none" ? values.needsYouPullRequests : "linked",
    providerIconStyle: values?.providerIconStyle === "monochrome" ? "monochrome" : "tint",
    showSubagents: bool("showSubagents"),
    showAge: bool("showAge"),
    hideInactiveProjectsAfterHours: readInactiveHours(values?.hideInactiveProjectsAfterHours),
    foldOnDrag: bool("foldOnDrag"),
    reduceMotion: bool("reduceMotion"),
  };
}

/** A cleared field (null or blank) turns hiding off; anything else invalid falls back to the default. */
function readInactiveHours(value: unknown): number {
  if (value === null || (typeof value === "string" && value.trim() === "")) return 0;
  const parsed = inactiveHours.safeParse(value);
  return parsed.success ? parsed.data : DEFAULTS.hideInactiveProjectsAfterHours;
}
