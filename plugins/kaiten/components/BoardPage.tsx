import { useState } from "react";
import {
  experimental_useRpcQuery as useRpcQuery,
  useBbNavigate,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { rpcContract } from "@/lib/contract";
import type { BoardCard } from "@/lib/kaiten";
import { dueLabel, filterColumns } from "@/lib/view";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "kaiten:filters";

function readFlag(name: string): boolean {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")[name] === true;
  } catch {
    return false;
  }
}

function writeFlag(name: string, value: boolean) {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, [name]: value }));
  } catch {
    // storage is only a convenience
  }
}

const CHIP = "inline-flex max-w-full items-center truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground";

export function BoardPage() {
  const { data, isLoading, error } = useRpcQuery({ contract: rpcContract, method: "board", input: null });
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [mine, setMine] = useState(() => readFlag("mine"));
  const [showDone, setShowDone] = useState(() => readFlag("showDone"));
  const [query, setQuery] = useState("");
  const [startingId, setStartingId] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const board = data?.board ?? null;
  const columns = board ? filterColumns(board.columns, { mine, showDone, query }) : [];
  const message = failure ?? data?.error ?? error?.message ?? null;

  async function open(card: BoardCard) {
    if (startingId !== null) return;
    if (card.threadId) {
      navigate.toThread(card.threadId);
      return;
    }
    setFailure(null);
    setStartingId(card.id);
    try {
      const { threadId } = await rpc.call("startCard", { cardId: card.id });
      navigate.toThread(threadId);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <button
          type="button"
          disabled={!board}
          onClick={() => board && navigate.openUrl(board.url)}
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline disabled:no-underline"
        >
          {board?.title ?? "Kaiten"}
          <Icon name="ArrowUpRight" aria-hidden className="size-3.5 text-muted-foreground" />
        </button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter cards"
          aria-label="Filter cards"
          className="h-8 w-44 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button variant="ghost" size="sm" aria-pressed={mine} onClick={() => { setMine(!mine); writeFlag("mine", !mine); }}>
          Mine
        </Button>
        <Button variant="ghost" size="sm" aria-pressed={showDone} onClick={() => { setShowDone(!showDone); writeFlag("showDone", !showDone); }}>
          Done
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            rpc.call("refresh", null).catch(() => undefined).finally(() => setRefreshing(false));
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Threads start in
          <select
            value={data?.projectId ?? ""}
            onChange={(event) => {
              if (event.target.value) rpc.call("setProject", { projectId: event.target.value }).catch((cause) => setFailure(String(cause)));
            }}
            className={cn(
              "h-8 rounded-md border bg-transparent px-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring",
              data && data.projectId === null ? "border-destructive" : "border-input",
            )}
          >
            {data?.projectId ? null : <option value="">Choose a project…</option>}
            {(data?.projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {message ? (
        <p role="alert" className="border-b border-border px-4 py-2 text-xs text-destructive">
          {message}
        </p>
      ) : null}

      {isLoading && !board ? <p className="p-4 text-sm text-muted-foreground">Loading the board…</p> : null}

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {columns.map((column) => (
          <section key={column.id} aria-label={column.title} className="flex min-h-0 w-72 shrink-0 flex-col rounded-lg bg-muted/40">
            <h2 className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
              {column.title}
              <span>{column.cards.length}</span>
            </h2>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {column.cards.map((card) => (
                <CardButton key={card.id} card={card} starting={startingId === card.id} disabled={startingId !== null} onOpen={() => open(card)} onOpenKaiten={() => navigate.openUrl(card.url)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function CardButton({
  card,
  starting,
  disabled,
  onOpen,
  onOpenKaiten,
}: {
  card: BoardCard;
  starting: boolean;
  disabled: boolean;
  onOpen: () => void;
  onOpenKaiten: () => void;
}) {
  const due = card.dueDate ? dueLabel(card.dueDate, new Date()) : null;
  return (
    <div className="group relative">
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        title={card.threadId ? "Open its thread" : "Start a thread for this card"}
        className={cn(
          "flex w-full flex-col gap-1.5 rounded-md border bg-card p-2.5 text-left text-card-foreground hover:bg-state-hover disabled:opacity-60",
          card.blocked ? "border-destructive/60" : "border-border",
        )}
      >
        <span className="pr-5 text-sm leading-snug">{card.title}</span>
        <span className="flex flex-wrap gap-1">
          <span className={CHIP}>#{card.id}</span>
          {card.threadId || starting ? <span className={cn(CHIP, "bg-primary/15 text-foreground")}>{starting ? "Starting…" : "Thread"}</span> : null}
          {card.asap ? <span className={cn(CHIP, "text-destructive")}>ASAP</span> : null}
          {card.blocked ? <span className={cn(CHIP, "text-destructive")}>Blocked</span> : null}
          {card.stage ? <span className={CHIP}>{card.stage}</span> : null}
          {card.type ? <span className={CHIP}>{card.type}</span> : null}
          {card.size ? <span className={CHIP}>{card.size}</span> : null}
          {due ? <span className={cn(CHIP, due.overdue && "text-destructive")}>{due.text}</span> : null}
          {card.tags.map((tag) => (
            <span key={tag} className={CHIP}>
              {tag}
            </span>
          ))}
        </span>
        {card.owner ? <span className="text-xs text-muted-foreground">{card.owner}</span> : null}
      </button>
      <button
        type="button"
        aria-label="Open in Kaiten"
        title="Open in Kaiten"
        onClick={onOpenKaiten}
        className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-state-hover group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Icon name="ArrowUpRight" aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
