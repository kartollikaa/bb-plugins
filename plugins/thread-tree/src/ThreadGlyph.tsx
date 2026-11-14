import { experimental_ThreadStatusGlyph as ThreadStatusGlyph, type PluginSidebarThreadIndicator, type PluginSidebarThreadRowStatus } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { useStill } from "./motion";
import { FOLD_GLYPH, glyphMotionClass, isIdleGlyph, type RowGlyph } from "./statusGlyph";
import type { FoldState } from "./tree";

/** Quiet, not empty: a blank glyph slot reads as a hole between the tree guide and the title. */
function IdleDot({ className }: { className?: string }) {
  return (
    <span aria-hidden data-status-glyph="idle" className={cn("flex items-center justify-center", className)}>
      <span className="size-1 rounded-full bg-subtle-foreground" />
    </span>
  );
}

/** bb's status glyph for a row; the row's link carries the label, so the glyph stays out of the accessibility tree. */
export function RowStatusGlyph({ glyph }: { glyph: RowGlyph<PluginSidebarThreadRowStatus> }) {
  const still = useStill();
  if (isIdleGlyph(glyph)) return <IdleDot className="size-4" />;
  return (
    <span aria-hidden data-status-glyph={glyph.indicator} className={cn("flex size-4 items-center justify-center", glyphMotionClass(still))}>
      <ThreadStatusGlyph indicator={glyph.indicator} rowStatus={glyph.rowStatus} size="compact" />
    </span>
  );
}

/** A rollup state (overview, fold line, status group) in bb's glyph, held still: it labels a count, it isn't live. */
export function RollupGlyph({ state, className }: { state: FoldState; className?: string }) {
  return <StillGlyph indicator={FOLD_GLYPH[state]} className={className} />;
}

/** bb's glyph for `indicator` at count size, held still. */
export function StillGlyph({ indicator, className }: { indicator: PluginSidebarThreadIndicator; className?: string }) {
  if (indicator === "none") return <IdleDot className={cn("size-3.5 shrink-0", className)} />;
  return (
    <span aria-hidden className={cn("flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3", glyphMotionClass(true), className)}>
      <ThreadStatusGlyph indicator={indicator} size="compact" />
    </span>
  );
}
