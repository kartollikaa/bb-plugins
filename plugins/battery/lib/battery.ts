export type BatteryState = "charging" | "discharging" | "charged" | "not-charging" | "unknown";

export interface BatteryReading {
  percent: number;
  state: BatteryState;
  onAcPower: boolean;
  /** "h:mm", or null while macOS has no estimate. */
  remaining: string | null;
}

/** Parses `pmset -g batt`; null when the machine reports no internal battery. */
export function parsePmset(output: string): BatteryReading | null {
  const line = output.split("\n").find((candidate) => /InternalBattery/.test(candidate));
  if (line === undefined) return null;
  const match = /(\d{1,3})%;\s*([^;]+?)\s*;/.exec(line);
  if (match === null) return null;
  const percent = Math.min(100, Number(match[1]));
  const remaining = /(\d+:\d{2}) remaining/.exec(line)?.[1] ?? null;
  return {
    percent,
    state: stateOf(match[2]),
    onAcPower: /drawing from 'AC Power'/.test(output),
    remaining: remaining === "0:00" ? null : remaining,
  };
}

function stateOf(raw: string): BatteryState {
  switch (raw.toLowerCase()) {
    case "charging":
    case "finishing charge":
      return "charging";
    case "discharging":
      return "discharging";
    case "charged":
      return "charged";
    case "ac attached":
      return "not-charging";
    default:
      return "unknown";
  }
}

const stateLabels: Record<BatteryState, string> = {
  charging: "charging",
  discharging: "on battery",
  charged: "charged",
  "not-charging": "plugged in, not charging",
  unknown: "unknown state",
};

export function describeBattery(reading: BatteryReading | null): string {
  if (reading === null) return "No battery found";
  const parts = [`${reading.percent}%`, stateLabels[reading.state]];
  if (reading.remaining !== null) {
    parts.push(reading.state === "charging" ? `${reading.remaining} to full` : `${reading.remaining} left`);
  }
  return parts.join(", ");
}

export const LOW_BATTERY_PERCENT = 20;

export function isLow(reading: BatteryReading | null): boolean {
  return reading !== null && reading.state === "discharging" && reading.percent <= LOW_BATTERY_PERCENT;
}

export function footerText(reading: BatteryReading | null): string {
  return reading === null ? "—" : `${reading.percent}%`;
}

/** The subset of the browser's BatteryManager the popup reads. */
export interface DeviceBattery {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

function formatSeconds(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export function describeDeviceBattery(battery: DeviceBattery): string {
  const percent = Math.round(battery.level * 100);
  const parts = [`${percent}%`];
  if (battery.charging) {
    parts.push(percent >= 100 ? "charged" : "charging");
    const toFull = formatSeconds(battery.chargingTime);
    if (toFull !== null && percent < 100) parts.push(`${toFull} to full`);
  } else {
    parts.push("on battery");
    const left = formatSeconds(battery.dischargingTime);
    if (left !== null) parts.push(`${left} left`);
  }
  return parts.join(", ");
}

/** The server's own browser would report the laptop twice, so only remote clients show their battery. */
export function isRemoteClient(hostname: string): boolean {
  return !["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
}
