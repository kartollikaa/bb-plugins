export interface Session {
  startedAt: number;
  endsAt: number | null;
  minutes: number | null;
  closedLid: boolean;
}

export interface StartRequest {
  minutes: number | null;
  closedLid: boolean;
  /** Keep the running session's end time and change only the lid mode. */
  keepEnd?: boolean;
}

export interface BatteryState {
  percent: number;
  onBattery: boolean;
}

export type StopReason = "expired" | "low-battery";

export interface PillStatus {
  session: Session | null;
  closedLidReady: boolean;
  sleepDisabled: boolean;
  lastStop: StopReason | null;
  batteryFloor: number;
  setupCommand: string;
  now: number;
}

export const BATTERY_FLOOR = 15;
export const DURATION_CHOICES: readonly (number | null)[] = [null, 60, 120, 240, 480];
const MAX_MINUTES = 7 * 24 * 60;

export function parseSleepDisabled(pmsetOutput: string): boolean {
  return /^\s*SleepDisabled\s+1\b/m.test(pmsetOutput);
}

export function parseBattery(pmsetBatt: string): BatteryState | null {
  const percent = /\t(\d{1,3})%;/.exec(pmsetBatt);
  if (percent === null) return null;
  return { percent: Number(percent[1]), onBattery: /Now drawing from 'Battery Power'/.test(pmsetBatt) };
}

export function validMinutes(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_MINUTES);
}

export function parseStartRequest(body: unknown): StartRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { minutes, closedLid, keepEnd } = body as Record<string, unknown>;
  if (!validMinutes(minutes) || typeof closedLid !== "boolean") return null;
  if (keepEnd !== undefined && typeof keepEnd !== "boolean") return null;
  return keepEnd === true ? { minutes, closedLid, keepEnd } : { minutes, closedLid };
}

export function newSession(request: StartRequest, now: number, current: Session | null = null): Session {
  if (request.keepEnd === true && current !== null) return { ...current, closedLid: request.closedLid };
  const endsAt = request.minutes === null ? null : now + request.minutes * 60_000;
  return { startedAt: now, endsAt, minutes: request.minutes, closedLid: request.closedLid };
}

export function restoredSession(stored: unknown, now: number): Session | null {
  if (typeof stored !== "object" || stored === null) return null;
  const { startedAt, endsAt, minutes, closedLid } = stored as Record<string, unknown>;
  if (typeof startedAt !== "number" || typeof closedLid !== "boolean" || !validMinutes(minutes)) return null;
  if (endsAt !== null && typeof endsAt !== "number") return null;
  if (endsAt !== null && endsAt <= now) return null;
  return { startedAt, endsAt, minutes, closedLid };
}

export function stopReason(session: Session, now: number, battery: BatteryState | null, floor = BATTERY_FLOOR): StopReason | null {
  if (session.endsAt !== null && now >= session.endsAt) return "expired";
  if (battery !== null && battery.onBattery && battery.percent <= floor) return "low-battery";
  return null;
}

/** `90m`, `2h`, `1h30m`, a bare number of minutes, or `forever`. `undefined` when unparseable. */
export function parseDuration(text: string): number | null | undefined {
  const value = text.trim().toLowerCase();
  if (value === "forever" || value === "indefinitely" || value === "inf") return null;
  if (/^\d+$/.test(value)) {
    const minutes = Number(value);
    return validMinutes(minutes) ? minutes : undefined;
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(value);
  if (match === null || (match[1] === undefined && match[2] === undefined)) return undefined;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return validMinutes(minutes) ? minutes : undefined;
}

export function durationLabel(minutes: number | null): string {
  if (minutes === null) return "∞";
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} m` : `${minutes} m`;
}

/** Time left as `h:mm`, or `null` for a session without an end. */
export function remaining(session: Session, now: number): string | null {
  if (session.endsAt === null) return null;
  const minutes = Math.max(0, Math.ceil((session.endsAt - now) / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function stateLine(status: Pick<PillStatus, "session" | "lastStop" | "batteryFloor">, now: number): string {
  const { session } = status;
  if (session === null) {
    if (status.lastStop === "low-battery") return `Off: battery fell to ${status.batteryFloor}%`;
    if (status.lastStop === "expired") return "Off: timer ran out";
    return "Off. The Mac sleeps as usual";
  }
  const left = remaining(session, now);
  const span = left === null ? "until you turn it off" : `${left} left`;
  return session.closedLid ? `Awake with the lid closed, ${span}` : `Awake, ${span}`;
}

export function describeStatus(status: PillStatus): string {
  const lines = [stateLine(status, status.now)];
  lines.push(`Closed-lid mode: ${status.closedLidReady ? "available" : "needs setup"}`);
  if (status.sleepDisabled) lines.push("macOS sleep is disabled (pmset disablesleep 1)");
  if (!status.closedLidReady) lines.push(`Setup: ${status.setupCommand}`);
  return lines.join("\n");
}

export function setupCommand(rawUser: string): string {
  const user = /^[A-Za-z0-9._-]+$/.test(rawUser) ? rawUser : "YOUR_MAC_USER";
  const rule = `${user} ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 0, /usr/bin/pmset -a disablesleep 1`;
  return `echo '${rule}' | sudo tee /etc/sudoers.d/power-pill >/dev/null && sudo chmod 440 /etc/sudoers.d/power-pill && sudo visudo -cf /etc/sudoers.d/power-pill`;
}
