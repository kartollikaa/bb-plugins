import { createContext, useContext, useEffect } from "react";

/** Reports a header menu opening (+1) or closing (-1), so the header keeps its hover controls shown meanwhile. */
export const HeaderMenuOpenContext = createContext<((delta: 1 | -1) => void) | null>(null);

export function useReportHeaderMenuOpen(open: boolean) {
  const report = useContext(HeaderMenuOpenContext);
  useEffect(() => {
    if (!open || !report) return;
    report(1);
    return () => report(-1);
  }, [open, report]);
}
