// The orchestration's progress drawn natively: a segmented bar for the status line and step glyphs for the Plan (docs/human-view.md §6.3).
import type { PartGlyph, PlanPart } from "./sections.ts";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** bg-primary is near-white in the dark theme, so a running part has its own colour. */
const SEGMENT: Record<PartGlyph, string> = {
  done: "bg-success",
  running: "bg-blue-500",
  active: "bg-warning",
  you: "bg-attention",
  stuck: "bg-destructive",
  todo: "bg-border",
};

const GLYPH: Record<PartGlyph, { mark: string; className: string }> = {
  done: { mark: "✓", className: "text-success" },
  running: { mark: "●", className: "text-blue-500" },
  active: { mark: "◐", className: "text-warning-text" },
  you: { mark: "!", className: "font-semibold text-attention" },
  stuck: { mark: "!", className: "font-semibold text-destructive" },
  todo: { mark: "○", className: "text-muted-foreground" },
};

export interface Segment {
  key: string;
  glyph: PartGlyph;
  /** The segment's tooltip: the part and its status word. */
  label: string;
}

export function segmentsOf(plan: readonly Pick<PlanPart, "key" | "title" | "word" | "glyph">[]): Segment[] {
  return plan.map((p) => ({ key: p.key, glyph: p.glyph, label: `${p.title}: ${p.word}` }));
}

export const progressLabel = (done: number, total: number) => `${done} of ${total} parts done`;

export function ProgressBar({ plan, done, className }: { plan: readonly PlanPart[]; done: number; className?: string }) {
  if (!plan.length) return null;
  return (
    <div role="img" aria-label={progressLabel(done, plan.length)} className={cx("flex h-1.5 w-full min-w-0 gap-0.5", className)}>
      {segmentsOf(plan).map((s) => <span key={s.key} title={s.label} data-glyph={s.glyph} className={cx("min-w-[3px] flex-1 rounded-sm", SEGMENT[s.glyph])} />)}
    </div>
  );
}

export function StepGlyph({ glyph, className }: { glyph: PartGlyph; className?: string }) {
  const { mark, className: tone } = GLYPH[glyph];
  return <span aria-hidden data-glyph={glyph} className={cx("inline-block w-4 shrink-0 text-center tabular-nums leading-[1.45]", tone, className)}>{mark}</span>;
}
