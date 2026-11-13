// What a thread row's status glyph shows, folded the way bb's own sidebar folds it.
import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";
import type { DotState } from "./tree";

export type GlyphIndicator = PluginSidebarThreadIndicator;

const INDICATORS = [
  "background-agent", "background-command", "draft", "goal", "none", "plan-mode", "queued-failed",
  "queued-waiting", "runtime", "unread-error", "unread-success", "waiting-for-input", "workflow", "working-draft",
] as const satisfies readonly GlyphIndicator[];

/** Fails to compile when the SDK adds an indicator this list lacks. */
type AssertAllIndicators = Exclude<GlyphIndicator, (typeof INDICATORS)[number]> extends never ? true : never;
const allIndicatorsListed: AssertAllIndicators = true;
void allIndicatorsListed;

export interface GlyphRowStatus {
  label: string;
}

export interface GlyphThread {
  status: string;
  indicator: string;
  indicatorLabel: string | null;
  runtimeStatus: string;
  activity: { workflows: number; backgroundAgents: number; backgroundCommands: number; planMode: number };
}

export interface RowGlyph<S extends GlyphRowStatus> {
  indicator: GlyphIndicator;
  /** Null when the indicator outranks it, as in bb's glyph. */
  rowStatus: S | null;
  /** The row's accessible state; null when the row draws nothing. */
  label: string | null;
}

const KNOWN = new Set<string>(INDICATORS);

const OUTRANKS_ROW_STATUS = new Set<GlyphIndicator>(["runtime", "unread-error", "waiting-for-input"]);

const OUTRANKS_DRAFT = new Set<GlyphIndicator>(["unread-error", "waiting-for-input"]);

const BUSY_RUNTIME = new Set(["active", "provisioning", "starting", "stopping"]);

/** The host may report these from a hidden helper thread, so the thread's own counts can read idle. */
const BUSY_INDICATORS = new Set<GlyphIndicator>(["runtime", "workflow", "background-agent", "background-command", "plan-mode"]);

const FAILED_LABEL = "Last turn failed";

/** bb's labels for the two indicators the host never reports, since a draft is client-local. */
const DRAFT_LABEL = {
  draft: "Thread has unsubmitted draft",
  "working-draft": "Thread working with unsubmitted draft",
} as const;

function isBusy(thread: GlyphThread, hostIndicator: GlyphIndicator): boolean {
  const { workflows, backgroundAgents, backgroundCommands, planMode } = thread.activity;
  return (
    BUSY_INDICATORS.has(hostIndicator) ||
    BUSY_RUNTIME.has(thread.runtimeStatus) ||
    workflows + backgroundAgents + backgroundCommands + planMode > 0
  );
}

export function resolveRowGlyph<S extends GlyphRowStatus>(
  thread: GlyphThread,
  hasUnsubmittedDraft: boolean,
  rowStatus: S | null,
): RowGlyph<S> {
  // bb adds kinds over time; an unknown one falls back to drawing nothing.
  const reported: GlyphIndicator = KNOWN.has(thread.indicator) ? (thread.indicator as GlyphIndicator) : "none";
  // bb only marks a root thread's failure unread; a read one or a subthread still failed.
  const failedUnmarked = thread.status === "error" && reported !== "unread-error" && reported !== "waiting-for-input";
  const hostIndicator: GlyphIndicator = failedUnmarked ? "unread-error" : reported;
  let indicator = hostIndicator;
  if (hasUnsubmittedDraft && !OUTRANKS_DRAFT.has(hostIndicator)) {
    if (isBusy(thread, hostIndicator)) indicator = "working-draft";
    else if (hostIndicator === "none") indicator = "draft";
  }
  const shownStatus = rowStatus !== null && !OUTRANKS_ROW_STATUS.has(indicator) ? rowStatus : null;
  const label =
    shownStatus?.label ??
    (indicator === "draft" || indicator === "working-draft"
      ? DRAFT_LABEL[indicator]
      : indicator === "none"
        ? null
        : failedUnmarked
          ? FAILED_LABEL
          : (thread.indicatorLabel ?? null));
  return { indicator, rowStatus: shownStatus, label };
}

/** bb's glyph would draw nothing; the row shows a faint dot instead so the slot never reads as a hole. */
export function isIdleGlyph(glyph: RowGlyph<GlyphRowStatus>): boolean {
  return glyph.indicator === "none" && glyph.rowStatus === null;
}

/** The rollup states (overview, fold line, status groups) drawn with bb's glyphs; "none" gets the idle dot. */
export const ROLLUP_GLYPH: Record<DotState, GlyphIndicator> = {
  input: "waiting-for-input",
  error: "unread-error",
  running: "runtime",
  done: "none",
  stopped: "none",
};

/** Stops every animation inside bb's glyph under the plugin's Reduce motion setting or the system preference. */
export function glyphMotionClass(reduceMotion: boolean): string {
  return reduceMotion ? "animate-none! [&_*]:animate-none!" : "motion-reduce:animate-none! motion-reduce:[&_*]:animate-none!";
}
