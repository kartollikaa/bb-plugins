import { z } from "zod";

const part = z.object({
  name: z.string(),
  role: z.string().nullable(),
  state: z.enum(["done", "running", "waiting", "not-started"]),
  word: z.string(),
});

export const rpcContract = {
  probe: {
    input: z.null(),
    output: z.object({
      progress: z.object({
        title: z.string(),
        stateWord: z.enum(["Needs you", "Blocked", "In progress", "Waiting", "Done", "Planning"]),
        sentence: z.string(),
        done: z.number(),
        total: z.number(),
        parts: z.array(part),
        asks: z.array(z.string()),
      }),
      chatThreadId: z.string().nullable(),
      readAt: z.string(),
    }),
  },
} as const;
