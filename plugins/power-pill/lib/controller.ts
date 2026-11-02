import { execFile, spawn, type ChildProcess } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";
import {
  BATTERY_FLOOR,
  newSession,
  parseBattery,
  parseSleepDisabled,
  restoredSession,
  setupCommand,
  stopReason,
  type PillStatus,
  type Session,
  type StartRequest,
  type StopReason,
} from "./pill.ts";

const run = promisify(execFile);
const SUDO = "/usr/bin/sudo";
const PMSET = "/usr/bin/pmset";
const SESSION_KEY = "session";
const OWNS_SLEEP_KEY = "ownsDisabledSleep";
const WATCHDOG_NAME = "power-pill-watchdog";
const READY_TTL_MS = 5 * 60_000;

interface Kv {
  get<T>(key: string): Promise<T | null | undefined> | T | null | undefined;
  set(key: string, value: unknown): Promise<void> | void;
  delete(key: string): Promise<void> | void;
}

interface Log {
  info(message: string): void;
  warn(message: string): void;
}

export class SetupRequiredError extends Error {}

// Resets disablesleep if the bb server process dies without cleaning up.
const WATCHDOG = `while kill -0 "$1" 2>/dev/null; do sleep 5; done; ${SUDO} -n ${PMSET} -a disablesleep 0`;

export function createController({ kv, log }: { kv: Kv; log: Log }) {
  let session: Session | null = null;
  let lastStop: StopReason | null = null;
  let caffeinate: ChildProcess | null = null;
  let watchdog: ChildProcess | null = null;
  let ready: { value: boolean; at: number } | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const darwin = process.platform === "darwin";

  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  async function closedLidReady(fresh = false): Promise<boolean> {
    if (!darwin) return false;
    if (!fresh && ready !== null && Date.now() - ready.at < READY_TTL_MS) return ready.value;
    let value = true;
    try {
      await run(SUDO, ["-k", "-n", "-l", PMSET, "-a", "disablesleep", "1"], { timeout: 5_000 });
    } catch {
      value = false;
    }
    ready = { value, at: Date.now() };
    return value;
  }

  async function sleepDisabled(): Promise<boolean> {
    if (!darwin) return false;
    try {
      return parseSleepDisabled((await run(PMSET, ["-g"], { timeout: 5_000 })).stdout);
    } catch {
      return false;
    }
  }

  async function setDisableSleep(on: boolean) {
    await run(SUDO, ["-n", PMSET, "-a", "disablesleep", on ? "1" : "0"], { timeout: 10_000 });
  }

  function startCaffeinate() {
    if (caffeinate !== null || !darwin) return;
    const child = spawn("/usr/bin/caffeinate", ["-i", "-m", "-s", "-w", String(process.pid)], { stdio: "ignore" });
    child.on("exit", () => {
      if (caffeinate === child) caffeinate = null;
    });
    child.on("error", (error) => log.warn(`caffeinate failed: ${error.message}`));
    caffeinate = child;
  }

  function stopCaffeinate() {
    caffeinate?.kill();
    caffeinate = null;
  }

  async function startWatchdog() {
    if (watchdog !== null) return;
    // A watchdog left by a previous server process would reset disablesleep under this one.
    await run("/usr/bin/pkill", ["-f", `^/bin/sh -c while kill -0 .* ${WATCHDOG_NAME} [0-9]+$`]).catch(() => undefined);
    watchdog = spawn("/bin/sh", ["-c", WATCHDOG, WATCHDOG_NAME, String(process.pid)], { detached: true, stdio: "ignore" });
    watchdog.unref();
  }

  async function enableClosedLid() {
    const owned = (await kv.get<boolean>(OWNS_SLEEP_KEY)) === true;
    if (!owned && (await sleepDisabled())) return;
    await startWatchdog();
    await kv.set(OWNS_SLEEP_KEY, true);
    await setDisableSleep(true);
  }

  async function disableClosedLid() {
    watchdog?.kill();
    watchdog = null;
    if ((await kv.get<boolean>(OWNS_SLEEP_KEY)) !== true) return;
    try {
      await setDisableSleep(false);
      await kv.delete(OWNS_SLEEP_KEY);
    } catch (error) {
      log.warn(`could not re-enable sleep: ${(error as Error).message}`);
    }
  }

  async function apply() {
    if (session === null) {
      stopCaffeinate();
      await disableClosedLid();
      return;
    }
    startCaffeinate();
    if (session.closedLid) await enableClosedLid();
    else await disableClosedLid();
  }

  async function readBattery() {
    if (!darwin) return null;
    try {
      return parseBattery((await run(PMSET, ["-g", "batt"], { timeout: 5_000 })).stdout);
    } catch {
      return null;
    }
  }

  async function setSession(next: Session | null) {
    session = next;
    if (next === null) await kv.delete(SESSION_KEY);
    else await kv.set(SESSION_KEY, next);
  }

  async function end(reason: StopReason | null) {
    await setSession(null);
    lastStop = reason;
    await apply();
    log.info(`session ended: ${reason ?? "turned off"}`);
  }

  return {
    restore: () =>
      serial(async () => {
        await setSession(restoredSession(await kv.get(SESSION_KEY), Date.now()));
        if (session?.closedLid === true && !(await closedLidReady(true))) await setSession({ ...session, closedLid: false });
        await apply();
      }),

    start: (request: StartRequest) =>
      serial(async () => {
        if (request.closedLid && !(await closedLidReady(true))) throw new SetupRequiredError("closed-lid mode needs the sudo rule");
        const previous = session;
        await setSession(newSession(request, Date.now(), previous));
        lastStop = null;
        try {
          await apply();
        } catch (error) {
          await setSession(previous);
          await apply().catch(() => undefined);
          throw error;
        }
      }),

    stop: () => serial(() => end(null)),

    tick: () =>
      serial(async () => {
        if (session === null) return;
        const reason = stopReason(session, Date.now(), await readBattery());
        if (reason !== null) return end(reason);
        startCaffeinate();
        if (session.closedLid && (await kv.get<boolean>(OWNS_SLEEP_KEY)) === true && !(await sleepDisabled())) {
          log.warn("disablesleep was reset under a closed-lid session; setting it again");
          await setDisableSleep(true);
        }
      }),

    status: async (): Promise<PillStatus> => {
      const [lidReady, disabled] = await Promise.all([closedLidReady(), sleepDisabled()]);
      return {
        session,
        closedLidReady: lidReady,
        sleepDisabled: disabled,
        lastStop,
        batteryFloor: BATTERY_FLOOR,
        setupCommand: setupCommand(userInfo().username),
        now: Date.now(),
      };
    },

    /** Releases the Mac without forgetting the session, so a reload picks it back up. */
    release: () =>
      serial(async () => {
        stopCaffeinate();
        await disableClosedLid();
      }),
  };
}
