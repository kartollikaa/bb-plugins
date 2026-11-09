import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { boardSchema } from "./kaiten";

export const BOARD_TAG = "board";

export const boardViewSchema = z.object({
  board: boardSchema.nullable(),
  /** Set when the board can't be read: no token, a Kaiten error. */
  error: z.string().nullable(),
  fetchedAt: z.number().nullable(),
  projects: z.array(z.object({ id: z.string(), name: z.string() })),
  /** The bb project new threads start in; null until the user picks one. */
  projectId: z.string().nullable(),
});
export type BoardView = z.infer<typeof boardViewSchema>;

export const rpcContract = defineRpcContract({
  board: {
    input: z.null(),
    output: boardViewSchema,
    tags: () => [BOARD_TAG],
  },
  refresh: {
    input: z.null(),
    output: boardViewSchema,
  },
  setProject: {
    input: z.object({ projectId: z.string().min(1).max(100) }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
  /** Starts a thread that works the card; a card that already has a live thread answers with that one. */
  startCard: {
    input: z.object({ cardId: z.number().int().positive() }).strict(),
    output: z.object({ threadId: z.string(), reused: z.boolean() }),
  },
});
