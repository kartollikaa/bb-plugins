import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createController, SetupRequiredError } from "./lib/controller.ts";
import { describeStatus, durationLabel, parseDuration, parseStartRequest, type StartRequest } from "./lib/pill.ts";

const TICK_MS = 30_000;
const USAGE = "Usage: bb power-pill status [--json] | on [--for 2h|90m|forever] [--lid] | off";

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });
}

function parseOnArgs(args: string[]): StartRequest | string {
  let minutes: number | null = null;
  let closedLid = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--lid") closedLid = true;
    else if (arg === "--for") {
      const parsed = parseDuration(args[++index] ?? "");
      if (parsed === undefined) return `Bad duration "${args[index] ?? ""}". Use 90m, 2h, 1h30m or forever.`;
      minutes = parsed;
    } else return `Unknown argument "${arg}". ${USAGE}`;
  }
  return { minutes, closedLid };
}

export default async function plugin(bb: BbPluginApi) {
  const pill = createController({ kv: bb.storage.kv, log: bb.log });

  bb.background.service("session", {
    async start(signal) {
      await pill.restore().catch((error: Error) => bb.log.warn(`restore failed: ${error.message}`));
      while (!signal.aborted) {
        await sleep(TICK_MS, signal);
        if (!signal.aborted) await pill.tick().catch((error: Error) => bb.log.warn(`tick failed: ${error.message}`));
      }
      await pill.release();
    },
  });

  bb.http.route("GET", "/status", async (context) => context.json(await pill.status()));

  bb.http.route("POST", "/start", async (context) => {
    const request = parseStartRequest(await context.req.json().catch(() => null));
    if (request === null) return context.json({ error: "Expected { minutes: number | null, closedLid: boolean }" }, 400);
    try {
      await pill.start(request);
    } catch (error) {
      if (error instanceof SetupRequiredError) return context.json({ error: error.message }, 409);
      throw error;
    }
    return context.json(await pill.status());
  });

  bb.http.route("POST", "/stop", async (context) => {
    await pill.stop();
    return context.json(await pill.status());
  });

  bb.cli.register({
    name: "power-pill",
    summary: "Keep the Mac awake, optionally with the lid closed",
    commands: [
      { name: "status", summary: "Show whether the Mac is held awake", usage: "bb power-pill status [--json]" },
      { name: "on", summary: "Keep the Mac awake", usage: "bb power-pill on [--for 2h|90m|forever] [--lid]" },
      { name: "off", summary: "Let the Mac sleep again", usage: "bb power-pill off" },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const [command = "status", ...rest] = argv.filter((arg) => arg !== "--json");
      if (command === "on") {
        const request = parseOnArgs(rest);
        if (typeof request === "string") return { exitCode: 1, stderr: request };
        try {
          await pill.start(request);
        } catch (error) {
          if (!(error instanceof SetupRequiredError)) throw error;
          const status = await pill.status();
          return { exitCode: 1, stderr: `Closed-lid mode needs a one-time sudo rule. Run:\n${status.setupCommand}` };
        }
        bb.log.info(`on for ${durationLabel(request.minutes)}${request.closedLid ? " with the lid closed" : ""}`);
      } else if (command === "off") {
        await pill.stop();
      } else if (command !== "status" || rest.length > 0) {
        return { exitCode: 1, stderr: USAGE };
      }
      const status = await pill.status();
      return { exitCode: 0, stdout: json ? JSON.stringify(status) : describeStatus(status) };
    },
  });
}
