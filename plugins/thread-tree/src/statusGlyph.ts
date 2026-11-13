// What a thread row's status glyph shows, folded the way bb's own sidebar folds it.
import type { DotState } from "./tree";

export type GlyphIndicator =
  | "background-agent"
  | "background-command"
  | "draft"
  | "goal"
  | "none"
  | "plan-mode"
  | "queued-failed"
  | "queued-waiting"
  | "runtime"
  | "unread-error"
  | "unread-success"
  | "waiting-for-input"
  | "workflow"
  | "working-draft";

export interface GlyphRowStatus {
  label: string;
}

export interface GlyphThread {
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

const KNOWN = new Set<string>([
  "background-agent", "background-command", "draft", "goal", "none", "plan-mode", "queued-failed",
  "queued-waiting", "runtime", "unread-error", "unread-success", "waiting-for-input", "workflow", "working-draft",
]);

/** bb's glyph draws these over another plugin's row status. */
const OUTRANKS_ROW_STATUS = new Set<GlyphIndicator>(["runtime", "unread-error", "waiting-for-input"]);

/** A draft never hides these. */
const OUTRANKS_DRAFT = new Set<GlyphIndicator>(["unread-error", "waiting-for-input"]);

const BUSY_RUNTIME = new Set(["active", "provisioning", "starting", "stopping"]);

/** bb's labels for the two indicators the host never reports, since a draft is client-local. */
const DRAFT_LABEL = {
  draft: "Thread has unsubmitted draft",
  "working-draft": "Thread working with unsubmitted draft",
} as const;

function isBusy(thread: GlyphThread): boolean {
  const { workflows, backgroundAgents, backgroundCommands, planMode } = thread.activity;
  return BUSY_RUNTIME.has(thread.runtimeStatus) || workflows + backgroundAgents + backgroundCommands + planMode > 0;
}

export function resolveRowGlyph<S extends GlyphRowStatus>(
  thread: GlyphThread,
  hasUnsubmittedDraft: boolean,
  rowStatus: S | null,
): RowGlyph<S> {
  // bb adds kinds over time; an unknown one falls back to drawing nothing.
  const hostIndicator: GlyphIndicator = KNOWN.has(thread.indicator) ? (thread.indicator as GlyphIndicator) : "none";
  let indicator = hostIndicator;
  if (hasUnsubmittedDraft && !OUTRANKS_DRAFT.has(hostIndicator)) {
    if (isBusy(thread)) indicator = "working-draft";
    else if (hostIndicator === "none") indicator = "draft";
  }
  const shownStatus = rowStatus !== null && !OUTRANKS_ROW_STATUS.has(indicator) ? rowStatus : null;
  const label =
    shownStatus?.label ??
    (indicator === "draft" || indicator === "working-draft"
      ? DRAFT_LABEL[indicator]
      : indicator === "none"
        ? null
        : (thread.indicatorLabel ?? null));
  return { indicator, rowStatus: shownStatus, label };
}

/** The rollup states (overview, fold line, status groups) drawn with bb's glyphs; "done" and "stopped" draw nothing. */
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
