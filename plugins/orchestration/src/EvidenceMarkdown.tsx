import { useEffect, useRef, useState } from "react";
import { Markdown, experimental_FilePreview, type ExperimentalLiveFileTarget } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { evidenceTarget, localEvidencePath } from "./evidence.ts";

export function EvidenceMarkdown({ content, sourcePath, hostId, threadId, workspace }: { content: string; sourcePath: string; hostId: string | null; threadId: string; workspace: { environmentId: string; rootPath: string; storageRootPath: string | null } | null }) {
  const [preview, setPreview] = useState<ExperimentalLiveFileTarget | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (preview && !dialog.current?.open) dialog.current?.showModal(); }, [preview]);
  const FilePreview = experimental_FilePreview;
  return <><div onClickCapture={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest("a");
    const path = localEvidencePath(anchor?.getAttribute("href") ?? "", sourcePath);
    if (!path) return;
    event.preventDefault();
    event.stopPropagation();
    const target = evidenceTarget(path, hostId, threadId, workspace);
    if (!target) {
      toast.error("File location unavailable", { description: "Open the orchestrator conversation to locate this evidence." });
    } else setPreview(target);
  }}><Markdown content={content} /></div>
    {preview && <dialog ref={dialog} onClose={() => setPreview(null)} className="fixed inset-0 z-50 m-auto h-[85vh] w-[min(900px,92vw)] max-w-none rounded-lg border border-border bg-background p-0 text-foreground backdrop:bg-black/50">
      <div className="flex h-full flex-col">
        <button type="button" className="self-end px-3 py-2 text-sm" onClick={() => { dialog.current?.close(); setPreview(null); }}>Close evidence</button>
        <div className="min-h-0 flex-1 overflow-auto"><FilePreview target={preview} renderPreview={(file) => <Markdown content={file.content} />} /></div>
      </div>
    </dialog>}
  </>;
}
