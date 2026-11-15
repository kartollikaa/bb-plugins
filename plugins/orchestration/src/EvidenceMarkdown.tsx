import { Markdown, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { localEvidencePath } from "./evidence.ts";

export function EvidenceMarkdown({ content, sourcePath, hostId }: { content: string; sourcePath: string; hostId: string | null }) {
  const navigate = useBbNavigate();
  return <div onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest("a");
    const path = localEvidencePath(anchor?.getAttribute("href") ?? "", sourcePath);
    if (!path) return;
    event.preventDefault();
    event.stopPropagation();
    if (!hostId || !navigate.experimental_openFilePreview({ target: { kind: "host", hostId, path }, location: null })) {
      toast.error("File location unavailable", { description: "Open the orchestrator conversation to locate this evidence." });
    }
  }}><Markdown content={content} /></div>;
}
