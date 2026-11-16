import type { ReactNode } from "react";
import type { View } from "./view.ts";

export function Recap({ view, title, withTitle, children }: { view: View; title: string | null; withTitle: boolean; children?: ReactNode }) {
  const { goal } = view.recap;
  return (
    <header className="flex flex-col gap-2 border-b border-border pb-4">
      {withTitle && title && (
        <h1 className="m-0 min-w-0 text-lg font-semibold leading-[1.3] tracking-[-0.015em] [overflow-wrap:anywhere] [text-wrap:balance]">{title}</h1>
      )}
      {goal && <p className="m-0 text-muted-foreground [overflow-wrap:anywhere] [text-wrap:pretty]">{goal}</p>}
      {children}
      <p className="m-0 text-xs font-medium" role="status">{view.phase.label}</p>
      {view.phase.detail && <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{view.phase.detail}</p>}
    </header>
  );
}
