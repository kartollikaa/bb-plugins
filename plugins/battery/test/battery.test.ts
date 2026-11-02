import assert from "node:assert/strict";
import { test } from "node:test";
import { describeBattery, chargeLevel, deviceSummary, laptopSummary, footerText, isLow, isRemoteClient, parsePmset } from "../lib/battery.ts";

const header = (source: string) => `Now drawing from '${source}'\n`;
const line = (rest: string) => ` -InternalBattery-0 (id=22610019)\t${rest} present: true\n`;

test("reads a discharging battery", () => {
  const reading = parsePmset(header("Battery Power") + line("28%; discharging; 1:08 remaining"));
  assert.deepEqual(reading, { percent: 28, state: "discharging", onAcPower: false, remaining: "1:08" });
  assert.equal(describeBattery(reading), "28%, on battery, 1:08 left");
  assert.equal(footerText(reading), "28%");
});

test("reads charging, charged and plugged-in states", () => {
  const charging = parsePmset(header("AC Power") + line("80%; charging; 0:42 remaining"));
  assert.equal(charging?.state, "charging");
  assert.equal(charging?.onAcPower, true);
  assert.equal(describeBattery(charging), "80%, charging, 0:42 to full");

  const charged = parsePmset(header("AC Power") + line("100%; charged; 0:00 remaining"));
  assert.deepEqual(charged, { percent: 100, state: "charged", onAcPower: true, remaining: null });

  const held = parsePmset(header("AC Power") + line("80%; AC attached; not charging"));
  assert.equal(held?.state, "not-charging");
  assert.equal(held?.remaining, null);

  const finishing = parsePmset(header("AC Power") + line("99%; finishing charge; 0:05 remaining"));
  assert.equal(finishing?.state, "charging");
});

test("treats a missing estimate as no time left", () => {
  const reading = parsePmset(header("Battery Power") + line("55%; discharging; (no estimate)"));
  assert.equal(reading?.remaining, null);
  assert.equal(describeBattery(reading), "55%, on battery");
});

test("reports no battery on a desktop Mac", () => {
  assert.equal(parsePmset(header("AC Power")), null);
  assert.equal(describeBattery(null), "No battery found");
  assert.equal(footerText(null), "—");
});

test("flags low charge only while discharging", () => {
  assert.equal(isLow(parsePmset(header("Battery Power") + line("20%; discharging; 0:30 remaining"))), true);
  assert.equal(isLow(parsePmset(header("Battery Power") + line("21%; discharging; 0:30 remaining"))), false);
  assert.equal(isLow(parsePmset(header("AC Power") + line("10%; charging; 1:30 remaining"))), false);
});

test("summarises the viewing device's battery without a timer", () => {
  assert.deepEqual(deviceSummary({ level: 0.8, charging: false, chargingTime: Infinity, dischargingTime: 7500 }), { percent: 80, state: "on battery", charging: false });
  assert.deepEqual(deviceSummary({ level: 0.42, charging: true, chargingTime: 1800, dischargingTime: Infinity }), { percent: 42, state: "charging", charging: true });
  assert.deepEqual(deviceSummary({ level: 1, charging: true, chargingTime: 0, dischargingTime: Infinity }), { percent: 100, state: "charged", charging: false });
});

test("summarises the laptop without a timer", () => {
  const reading = parsePmset(header("AC Power") + line("64%; charging; 0:40 remaining"));
  assert.deepEqual(laptopSummary(reading!), { percent: 64, state: "charging", charging: true });
});

test("colours the charge red, yellow, green", () => {
  assert.equal(chargeLevel(5), "low");
  assert.equal(chargeLevel(20), "low");
  assert.equal(chargeLevel(21), "medium");
  assert.equal(chargeLevel(50), "medium");
  assert.equal(chargeLevel(51), "high");
  assert.equal(chargeLevel(100), "high");
});

test("shows the device battery only away from the server machine", () => {
  assert.equal(isRemoteClient("localhost"), false);
  assert.equal(isRemoteClient("127.0.0.1"), false);
  assert.equal(isRemoteClient("kartollika.getbb.app"), true);
});
