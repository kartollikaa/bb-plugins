import { z } from "zod";

export const DEFAULT_DOMAIN = "dodopizza.kaiten.ru";
export const DEFAULT_BOARD_ID = 1330003;

const DONE_COLUMN_TYPE = 3;
const MAX_DESCRIPTION = 6000;
const MAX_COMMENT = 800;
const MAX_COMMENTS = 10;

export const cardSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  columnId: z.number(),
  stage: z.string().nullable(),
  type: z.string().nullable(),
  owner: z.string().nullable(),
  members: z.array(z.string()),
  tags: z.array(z.string()),
  size: z.string().nullable(),
  blocked: z.boolean(),
  asap: z.boolean(),
  dueDate: z.string().nullable(),
  comments: z.number(),
  mine: z.boolean(),
  threadId: z.string().nullable(),
});
export type BoardCard = z.infer<typeof cardSchema>;

export const columnSchema = z.object({
  id: z.number(),
  title: z.string(),
  done: z.boolean(),
  cards: z.array(cardSchema),
});
export type BoardColumn = z.infer<typeof columnSchema>;

export const boardSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  columns: z.array(columnSchema),
});
export type Board = z.infer<typeof boardSchema>;

type RawUser = { id?: number; full_name?: string } | null | undefined;
type RawColumn = {
  id: number;
  title: string;
  sort_order: number;
  type: number;
  subcolumns?: RawColumn[];
};
export type RawBoard = { id: number; title: string; columns: RawColumn[] };
export type RawCard = {
  id: number;
  title: string;
  archived?: boolean;
  column_id: number;
  sort_order: number;
  owner?: RawUser;
  owner_id?: number | null;
  members?: RawUser[];
  tags?: { name: string }[];
  type?: { name: string } | null;
  size_text?: string | null;
  blocked?: boolean;
  asap?: boolean;
  due_date?: string | null;
  comments_total?: number;
};

export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    let value = match[2]!.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length > 1) {
      const end = value.indexOf(quote, 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[match[1]!] = value;
  }
  return values;
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
}

export type Credentials = { token: string; domain: string };

/**
 * Settings win; then the Kaiten CLI plugin's `~/.config/kaiten/.env.local` (KAITEN_TOKEN, KAITEN_DOMAIN);
 * then the Kaiten MCP's `~/.config/kaiten/config.json` (`token`, `url`).
 */
export function resolveCredentials(sources: {
  settingToken: string | undefined;
  settingDomain: string | undefined;
  envFile: string | null;
  configJson: string | null;
}): Credentials | null {
  const env = sources.envFile === null ? {} : parseEnvFile(sources.envFile);
  let config: { token?: unknown; url?: unknown } = {};
  try {
    const parsed: unknown = sources.configJson === null ? null : JSON.parse(sources.configJson);
    if (parsed !== null && typeof parsed === "object") config = parsed;
  } catch {
    config = {};
  }
  const token = [sources.settingToken, env.KAITEN_TOKEN, config.token]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value !== "");
  if (token === undefined) return null;
  const domain = [sources.settingDomain, env.KAITEN_DOMAIN, typeof config.url === "string" ? config.url : undefined]
    .map((value) => normalizeDomain(value ?? ""))
    .find((value) => value !== "");
  return { token, domain: domain ?? DEFAULT_DOMAIN };
}

export function cardUrl(domain: string, cardId: number): string {
  return `https://${domain}/${cardId}`;
}

export function boardUrl(domain: string, boardId: number): string {
  return `https://${domain}/board/${boardId}`;
}

function shortName(user: RawUser): string | null {
  const name = user?.full_name?.trim();
  return name ? name : null;
}

/** Cards in a sub-column show under their parent column; the sub-column becomes the card's stage. */
export function buildBoard(
  raw: RawBoard,
  cards: RawCard[],
  options: { domain: string; userId: number | null; threads: ReadonlyMap<number, string> },
): Board {
  const top = [...raw.columns].sort((a, b) => a.sort_order - b.sort_order);
  const owner = new Map<number, { column: RawColumn; stage: string | null }>();
  for (const column of top) {
    owner.set(column.id, { column, stage: null });
    for (const sub of column.subcolumns ?? []) owner.set(sub.id, { column, stage: sub.title });
  }
  const byColumn = new Map<number, RawCard[]>();
  for (const card of cards) {
    if (card.archived) continue;
    const place = owner.get(card.column_id);
    if (place === undefined) continue;
    const list = byColumn.get(place.column.id) ?? [];
    list.push(card);
    byColumn.set(place.column.id, list);
  }
  return {
    id: raw.id,
    title: raw.title,
    url: boardUrl(options.domain, raw.id),
    columns: top.map((column) => ({
      id: column.id,
      title: column.title,
      done: column.type === DONE_COLUMN_TYPE,
      cards: (byColumn.get(column.id) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((card) => ({
          id: card.id,
          title: card.title,
          url: cardUrl(options.domain, card.id),
          columnId: card.column_id,
          stage: owner.get(card.column_id)?.stage ?? null,
          type: card.type?.name ?? null,
          owner: shortName(card.owner),
          members: (card.members ?? []).map(shortName).filter((name): name is string => name !== null),
          tags: (card.tags ?? []).map((tag) => tag.name),
          size: card.size_text ? card.size_text : null,
          blocked: card.blocked === true,
          asap: card.asap === true,
          dueDate: card.due_date ?? null,
          comments: card.comments_total ?? 0,
          mine:
            options.userId !== null &&
            (card.owner_id === options.userId ||
              card.owner?.id === options.userId ||
              (card.members ?? []).some((member) => member?.id === options.userId)),
          threadId: options.threads.get(card.id) ?? null,
        })),
    })),
  };
}

export type RawComment = { text?: string; author?: RawUser; created?: string };
export type RawCardDetail = RawCard & {
  description?: string | null;
  checklists?: { name?: string; title?: string; items?: { text?: string; checked?: boolean }[] }[] | null;
};

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

/** The first message of the thread that works a card. */
export function cardPrompt(card: RawCardDetail, comments: RawComment[], domain: string): string {
  const lines = [
    `Do the Kaiten card #${card.id}: ${card.title}`,
    `Card: ${cardUrl(domain, card.id)}`,
  ];
  const facts = [
    card.type?.name ? `Type: ${card.type.name}` : "",
    shortName(card.owner) ? `Owner: ${shortName(card.owner)}` : "",
    card.size_text ? `Size: ${card.size_text}` : "",
    card.tags && card.tags.length > 0 ? `Tags: ${card.tags.map((tag) => tag.name).join(", ")}` : "",
  ].filter(Boolean);
  if (facts.length > 0) lines.push(facts.join(" · "));

  const description = card.description?.trim();
  lines.push("", "## Description", description ? clip(description, MAX_DESCRIPTION) : "(empty)");

  for (const list of card.checklists ?? []) {
    const items = (list.items ?? []).filter((item) => item.text);
    if (items.length === 0) continue;
    lines.push("", `## Checklist${list.name || list.title ? `: ${list.name ?? list.title}` : ""}`);
    for (const item of items) lines.push(`- [${item.checked ? "x" : " "}] ${item.text}`);
  }

  const recent = comments.filter((comment) => comment.text?.trim()).slice(-MAX_COMMENTS);
  if (recent.length > 0) {
    lines.push("", "## Latest comments");
    for (const comment of recent) {
      const who = shortName(comment.author) ?? "unknown";
      lines.push(`- ${who}: ${clip(comment.text ?? "", MAX_COMMENT).replace(/\n+/g, " ")}`);
    }
  }

  lines.push(
    "",
    "Implement what the card asks for in this project. Follow the repository's own rules and workflow.",
    "Don't move the card, comment on it or change it in Kaiten unless asked; report the outcome here.",
  );
  return lines.join("\n");
}
