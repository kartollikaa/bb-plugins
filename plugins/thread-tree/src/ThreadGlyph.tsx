import { experimental_ThreadStatusGlyph as ThreadStatusGlyph, type PluginSidebarThreadRowStatus } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { useStill } from "./motion";
import { glyphMotionClass, isIdleGlyph, ROLLUP_GLYPH, type RowGlyph } from "./statusGlyph";
import type { DotState } from "./tree";

/** bb's status glyph for a row; the row's link carries the label, so the glyph stays out of the accessibility tree. */
export function RowStatusGlyph({ glyph }: { glyph: RowGlyph<PluginSidebarThreadRowStatus> }) {
  const still = useStill();
  if (isIdleGlyph(glyph)) {
    return (
      <span aria-hidden data-status-glyph="idle" className="flex size-4 items-center justify-center">
        <span className="size-1 rounded-full bg-subtle-foreground" />
      </span>
    );
  }
  return (
    <span aria-hidden data-status-glyph={glyph.indicator} className={cn("flex size-4 items-center justify-center", glyphMotionClass(still))}>
      <ThreadStatusGlyph indicator={glyph.indicator} rowStatus={glyph.rowStatus} size="compact" />
    </span>
  );
}

/** A rollup state (overview, fold line, status group) in bb's glyph, held still: it labels a count, it isn't live. */
export function RollupGlyph({ state, className }: { state: DotState; className?: string }) {
  const indicator = ROLLUP_GLYPH[state];
  if (indicator === "none") return null;
  return (
    <span aria-hidden className={cn("flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3", glyphMotionClass(true), className)}>
      <ThreadStatusGlyph indicator={indicator} size="compact" />
    </span>
  );
}
