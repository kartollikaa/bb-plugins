import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeStatus,
  durationLabel,
  newSession,
  parseBattery,
  parseDuration,
  parseSleepDisabled,
  parseStartRequest,
  remaining,
  restoredSession,
  setupCommand,
  stateLine,
  stopReason,
  type PillStatus,
} from "../lib/pill.ts";

const HOUR = 3_600_000;

test("reads SleepDisabled from pmset -g", () => {
  assert.equal(parseSleepDisabled("System-wide power settings:\n SleepDisabled\t\t1\nCurrently in use:\n"), true);
  assert.equal(parseSleepDisabled("System-wide power settings:\n SleepDisabled\t\t0\n"), false);
  assert.equal(parseSleepDisabled(" sleep 1\n"), false);
});

test("reads battery charge and source", () => {
  const line = " -InternalBattery-0 (id=1)\t14%; discharging; 0:40 remaining present: true\n";
  assert.deepEqual(parseBattery(`Now drawing from 'Battery Power'\n${line}`), { percent: 14, onBattery: true });
  assert.deepEqual(parseBattery(`Now drawing from 'AC Power'\n${line}`), { percent: 14, onBattery: false });
  assert.equal(parseBattery("Now drawing from 'AC Power'\n"), null);
});

test("validates the start request body", () => {
  assert.deepEqual(parseStartRequest({ minutes: null, closedLid: true }), { minutes: null, closedLid: true });
  assert.deepEqual(parseStartRequest({ minutes: 120, closedLid: false }), { minutes: 120, closedLid: false });
  assert.deepEqual(parseStartRequest({ minutes: 120, closedLid: true, keepEnd: true }), { minutes: 120, closedLid: true, keepEnd: true });
  assert.deepEqual(parseStartRequest({ minutes: 120, closedLid: true, keepEnd: false }), { minutes: 120, closedLid: true });
  for (const bad of [null, "x", {}, { minutes: 0, closedLid: false }, { minutes: 1.5, closedLid: false }, { minutes: 60 }, { minutes: 99_999, closedLid: false }, { minutes: 5, closedLid: false, keepEnd: "yes" }]) {
    assert.equal(parseStartRequest(bad), null, JSON.stringify(bad));
  }
});

test("a session ends on its timer or at the battery floor", () => {
  const timed = newSession({ minutes: 60, closedLid: false }, 0);
  assert.equal(timed.endsAt, HOUR);
  assert.equal(stopReason(timed, HOUR - 1, null), null);
  assert.equal(stopReason(timed, HOUR, null), "expired");

  const open = newSession({ minutes: null, closedLid: true }, 0);
  assert.equal(stopReason(open, 100 * HOUR, { percent: 16, onBattery: true }), null);
  assert.equal(stopReason(open, 100 * HOUR, { percent: 15, onBattery: true }), "low-battery");
  assert.equal(stopReason(open, 100 * HOUR, { percent: 5, onBattery: false }), null);
});

test("lid changes can keep the running session's end time", () => {
  const running = newSession({ minutes: 120, closedLid: false }, 0);
  assert.deepEqual(newSession({ minutes: 120, closedLid: true, keepEnd: true }, HOUR, running), { ...running, closedLid: true });
  assert.equal(newSession({ minutes: 60, closedLid: true }, HOUR, running).endsAt, 2 * HOUR);
  assert.equal(newSession({ minutes: 60, closedLid: true, keepEnd: true }, HOUR, null).endsAt, 2 * HOUR);
});

test("restores only a well-formed, unexpired session", () => {
  const forever = { startedAt: 1, endsAt: null, minutes: null, closedLid: false };
  const timed = { startedAt: 1, endsAt: 20, minutes: 1, closedLid: true };
  assert.deepEqual(restoredSession(forever, 10), forever);
  assert.deepEqual(restoredSession(timed, 10), timed);
  assert.equal(restoredSession({ ...timed, endsAt: 10 }, 10), null);
  assert.equal(restoredSession({ ...timed, endsAt: "x" }, 10), null);
  assert.equal(restoredSession({ startedAt: 1, endsAt: null, closedLid: false }, 10), null);
  assert.equal(restoredSession(undefined, 10), null);
});

test("parses CLI durations", () => {
  assert.equal(parseDuration("forever"), null);
  assert.equal(parseDuration("90"), 90);
  assert.equal(parseDuration("90m"), 90);
  assert.equal(parseDuration("2h"), 120);
  assert.equal(parseDuration("1h30m"), 90);
  for (const bad of ["", "h", "0", "0m", "2x", "-5", "9999h"]) assert.equal(parseDuration(bad), undefined, bad);
});

test("labels durations and time left", () => {
  assert.equal(durationLabel(null), "∞");
  assert.equal(durationLabel(120), "2 h");
  assert.equal(durationLabel(45), "45 m");
  assert.equal(durationLabel(90), "1 h 30 m");
  const session = newSession({ minutes: 120, closedLid: false }, 0);
  assert.equal(remaining(session, 0), "2:00");
  assert.equal(remaining(session, HOUR + 1), "1:00");
  assert.equal(remaining(session, 2 * HOUR - 30_000), "0:01");
  assert.equal(remaining(newSession({ minutes: null, closedLid: false }, 0), 5), null);
});

test("describes the state", () => {
  const base = { session: null, lastStop: null, batteryFloor: 15 } as const;
  assert.equal(stateLine(base, 0), "Off. The Mac sleeps as usual");
  assert.equal(stateLine({ ...base, lastStop: "low-battery" }, 0), "Off: battery fell to 15%");
  assert.equal(stateLine({ ...base, session: newSession({ minutes: null, closedLid: false }, 0) }, 0), "Awake, until you turn it off");
  assert.equal(stateLine({ ...base, session: newSession({ minutes: 60, closedLid: true }, 0) }, 0), "Awake with the lid closed, 1:00 left");

  const status: PillStatus = { ...base, closedLidReady: false, sleepDisabled: false, setupCommand: "cmd", now: 0 };
  assert.equal(describeStatus(status), "Off. The Mac sleeps as usual\nClosed-lid mode: needs setup\nSetup: cmd");
});

test("the setup command only allows toggling disablesleep", () => {
  const command = setupCommand("dima");
  assert.match(command, /dima ALL=\(root\) NOPASSWD: \/usr\/bin\/pmset -a disablesleep 0, \/usr\/bin\/pmset -a disablesleep 1/);
  assert.match(command, /visudo -cf \/etc\/sudoers\.d\/power-pill/);
  assert.match(setupCommand("x'; rm -rf /"), /^echo 'YOUR_MAC_USER ALL/);
});
