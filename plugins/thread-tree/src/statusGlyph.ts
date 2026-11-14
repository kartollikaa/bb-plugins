// What a thread row's status glyph shows, folded the way bb's own sidebar folds it.
import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";
import { hasBackgroundWork, WORKING_INDICATORS, type FoldState, type ThreadState } from "./tree.ts";
import type { StatusFilter } from "./statusFilters.ts";

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
  isArchived: boolean;
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

const OUTRANKS_ROW_STATUS = new Set<GlyphIndicator>(["runtime", "unread-error", "waiting-for-input", "queued-failed"]);

/** Already a failure in bb's own words, so the generic failed override leaves it alone. */
const REPORTS_FAILURE = new Set<GlyphIndicator>(["unread-error", "waiting-for-input", "queued-failed"]);

const OUTRANKS_DRAFT = new Set<GlyphIndicator>(["unread-error", "waiting-for-input", "queued-failed"]);

const BUSY_RUNTIME = new Set(["active", "provisioning", "starting", "stopping"]);


const FAILED_LABEL = "Last turn failed";

/** bb's labels for the two indicators the host never reports, since a draft is client-local. */
const DRAFT_LABEL = {
  draft: "Thread has unsubmitted draft",
  "working-draft": "Thread working with unsubmitted draft",
} as const;

/** The host may report a busy indicator from a hidden helper thread, so the thread's own counts can read idle. */
function isBusy(thread: GlyphThread, hostIndicator: GlyphIndicator): boolean {
  return (
    WORKING_INDICATORS.has(hostIndicator) ||
    hostIndicator === "plan-mode" ||
    BUSY_RUNTIME.has(thread.runtimeStatus) ||
    hasBackgroundWork(thread.activity) ||
    thread.activity.planMode > 0
  );
}

export function resolveRowGlyph<S extends GlyphRowStatus>(
  thread: GlyphThread,
  hasUnsubmittedDraft: boolean,
  rowStatus: S | null,
): RowGlyph<S> {
  // bb adds kinds over time; an unknown one falls back to drawing nothing.
  const reported: GlyphIndicator = KNOWN.has(thread.indicator) ? (thread.indicator as GlyphIndicator) : "none";
  // bb only marks a root thread's failure unread; a read one or a subthread still failed. Archived rows stay as bb draws them.
  const failedUnmarked = thread.status === "error" && !thread.isArchived && !REPORTS_FAILURE.has(reported);
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
export const ROLLUP_GLYPH: Record<ThreadState, GlyphIndicator> = {
  input: "waiting-for-input",
  error: "unread-error",
  running: "runtime",
  waiting: "queued-waiting",
  done: "none",
};

export const FOLD_GLYPH: Record<FoldState, GlyphIndicator> = { ...ROLLUP_GLYPH, unread: "unread-success" };

const ROLLUP_LABEL: Record<FoldState, string> = {
  input: "Subthread needs input",
  error: "Subthread failed",
  running: "Subthread running",
  waiting: "Subthread waiting",
  unread: "Subthread finished, not read",
  done: "Subthreads done",
};

/** A folded parent or an orchestration shortcut drawing its subtree's state; the label still names its own first. */
export function rollupGlyph(state: FoldState, ownLabel: string | null): RowGlyph<never> {
  const below = ROLLUP_LABEL[state];
  return { indicator: FOLD_GLYPH[state], rowStatus: null, label: ownLabel ? `${ownLabel}; ${below[0]!.toLowerCase()}${below.slice(1)}` : below };
}

/** The status line's counts, drawn as the row glyph each one lists. */
export const FILTER_GLYPH: Record<StatusFilter, GlyphIndicator> = {
  input: "waiting-for-input",
  error: "unread-error",
  running: "runtime",
  unread: "unread-success",
};

/** Stops every animation inside bb's glyph under the plugin's Reduce motion setting or the system preference. */
export function glyphMotionClass(reduceMotion: boolean): string {
  return reduceMotion ? "animate-none! [&_*]:animate-none!" : "motion-reduce:animate-none! motion-reduce:[&_*]:animate-none!";
}
