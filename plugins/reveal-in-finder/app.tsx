import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRpc,
  type PluginMessageDirectiveProps,
} from "@get-bb/plugin-sdk/app";
import type { FileInfo, OpenApp, rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const ICONS: Record<string, string> = {
  apk: "Package",
  aab: "Package",
  zip: "FileArchive",
  gz: "FileArchive",
  tar: "FileArchive",
  md: "FileText",
  txt: "FileText",
  pdf: "FileText",
  png: "FileImage",
  jpg: "FileImage",
  jpeg: "FileImage",
  webp: "FileImage",
  gif: "FileImage",
  svg: "FileImage",
  mp4: "FileVideo",
  mov: "FileVideo",
  json: "FileCode",
  kt: "FileCode",
  kts: "FileCode",
  ts: "FileCode",
  tsx: "FileCode",
  html: "FileCode",
  py: "FileCode",
};

export function iconFor(info: FileInfo | null): string {
  if (info === null || !info.exists) return "File";
  if (info.kind === "folder") return "Folder";
  return ICONS[info.extension] ?? "File";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function subtitleFor(info: FileInfo | null): string {
  if (info === null) return "…";
  if (!info.exists) return "Not found";
  if (info.kind === "folder") return "Folder";
  const kind = info.extension === "" ? "File" : info.extension.toUpperCase();
  return `${kind} · ${formatBytes(info.bytes)}`;
}

function FileCard({ attributes, message }: PluginMessageDirectiveProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const rawPath = attributes.path ?? "";
  const threadId = message.threadId;
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (rawPath === "") {
      setInfo({ exists: false, path: null, name: "No path" });
      return;
    }
    rpc.call("describe", { path: rawPath, threadId }).then(
      (result) => live && setInfo(result),
      () => live && setInfo({ exists: false, path: null, name: rawPath }),
    );
    return () => {
      live = false;
    };
  }, [rpc, rawPath, threadId]);

  const openWith = useCallback(
    (app: OpenApp) => {
      setError(null);
      rpc.call("open", { path: rawPath, threadId, app }).then(
        (result) => !result.ok && setError(result.reason),
        (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
      );
    },
    [rpc, rawPath, threadId],
  );

  const preview = useCallback((): boolean => {
    if (info === null || !info.exists || info.kind !== "file" || info.hostId === null) return false;
    return navigate.experimental_openFilePreview({
      target: { kind: "host", hostId: info.hostId, path: info.path },
      location: null,
    });
  }, [info, navigate]);

  const activate = useCallback(() => {
    if (info === null || !info.exists) return;
    if (!preview()) openWith("finder");
  }, [info, preview, openWith]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  };

  const found = info?.exists === true ? info : null;
  const exists = found !== null;
  const name = info?.name ?? rawPath.split("/").pop() ?? rawPath;
  const canPreview = found?.kind === "file" && found.hostId !== null;

  return (
    <div
      role="button"
      tabIndex={exists ? 0 : -1}
      title={info?.path ?? rawPath}
      onClick={activate}
      onKeyDown={onKeyDown}
      className={cn(
        "not-prose my-2 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left",
        exists ? "cursor-pointer hover:bg-accent/40" : "opacity-70",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name={iconFor(info)} fallback="File" className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{name}</div>
        <div className={cn("truncate text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          {error ?? subtitleFor(info)}
        </div>
      </div>
      {found !== null && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1"
              onClick={(event) => event.stopPropagation()}
            >
              Open in
              <Icon name="ChevronDown" className="size-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem onSelect={() => openWith("finder")}>
              <Icon name="FolderOpen" className="size-4" aria-hidden />
              Finder
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openWith("default")}>
              <Icon name="AppWindow" fallback="ExternalLink" className="size-4" aria-hidden />
              {found.kind === "folder" ? "New Finder window" : "Default app"}
            </DropdownMenuItem>
            {canPreview && (
              <DropdownMenuItem onSelect={() => void preview()}>
                <Icon name="Eye" className="size-4" aria-hidden />
                bb preview
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.messageDirective({ id: "file", component: FileCard });
});
