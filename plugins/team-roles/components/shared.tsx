import type { ReactNode } from "react";
import { experimental_copyToClipboard } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";

export const CHIP = "inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground";

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border border-dashed border-border px-4 py-4 text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </div>
  );
}

export function CopyText({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md bg-muted px-2 py-1 text-xs">{text}</code>
      <Button variant="outline" size="sm" onClick={() => void experimental_copyToClipboard({ text })}>
        Copy
      </Button>
    </div>
  );
}
