import { useEffect, useState } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import type { Artifact } from "@/lib/contract";
import { relativeTime } from "@/lib/format";
import type { Source } from "@/lib/lookup";
import { cn } from "@/lib/utils";

export const SOURCE_ICON: Record<Source, string> = { claude: "artifacts/page", codex: "artifacts/globe" };

function Preview({ item, icon }: { item: Artifact; icon: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.thumbnail]);
  if (item.thumbnail && !failed) {
    const image = "absolute inset-0 size-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.02]";
    return (
      <>
        <img
          src={item.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={item.thumbnailDark ? `${image} dark:hidden` : image}
        />
        {item.thumbnailDark ? (
          <img
            src={item.thumbnailDark}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className={`${image} hidden dark:block`}
          />
        ) : null}
      </>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col gap-2 p-3">
      <Icon name={icon} aria-hidden className="size-5 text-muted-foreground" />
      {item.description ? <p className="line-clamp-4 text-xs text-muted-foreground">{item.description}</p> : null}
    </div>
  );
}

export function ArtifactCard({ item, source, className }: { item: Artifact; source: Source; className?: string }) {
  const navigate = useBbNavigate();
  const meta = [item.detail, relativeTime(item.updatedAt)].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      title={item.description ? `${item.title}\n${item.description}` : item.title}
      onClick={() => navigate.openUrl(item.url)}
      className={cn("group flex w-full flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-muted">
        <Preview item={item} icon={SOURCE_ICON[source]} />
        {item.starred ? (
          <Icon name="artifacts/star" aria-label="Starred" className="absolute right-2 top-2 size-4 text-amber-500 drop-shadow" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col px-0.5">
        <span className="truncate text-sm font-medium group-hover:underline">{item.title}</span>
        {meta ? <span className="truncate text-xs text-muted-foreground">{meta}</span> : null}
      </div>
    </button>
  );
}
