"use strict";

const { spawn } = require("child_process");
const detectPlatform = require("./detect_platform");

const DEFAULT_MAX_MS = 5000;
const DEFAULT_MAX_SEC = 10;
const DEFAULT_COOLDOWN_SEC = 3;
const MIN_PULSE_SEC = 0.1;

let gpiosetAvailable = null;
const lastActionTime = {};

function getEnv(name, def) {
  const v = process.env[name];
  return v !== undefined && v !== "" ? v : def;
}

function isControlEnabled() {
  if (!detectPlatform.isRaspberryPi()) return false;
  return getEnv("PICLAW_GPIO_CONTROL_ENABLED", "0") === "1";
}

function parseWhitelist() {
  const raw = (getEnv("PICLAW_GPIO_OUTPUT_WHITELIST", "") || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 0);
}

function getControlConfig() {
  const enabled = isControlEnabled();
  const whitelist = parseWhitelist();
  const maxMs = Math.min(60000, Math.max(100, parseInt(getEnv("PICLAW_GPIO_MAX_MS", String(DEFAULT_MAX_MS)), 10) || DEFAULT_MAX_MS));
  const maxSec = Math.min(60, Math.max(1, parseInt(getEnv("PICLAW_GPIO_MAX_SEC", String(DEFAULT_MAX_SEC)), 10) || DEFAULT_MAX_SEC));
  const cooldownSec = Math.max(0, parseInt(getEnv("PICLAW_GPIO_ACTION_COOLDOWN_SEC", String(DEFAULT_COOLDOWN_SEC)), 10) || DEFAULT_COOLDOWN_SEC);
  return {
    enabled,
    whitelist,
    maxMs,
    maxSec,
    cooldownSec,
    gpiosetAvailable: checkGpiosetSync(),
  };
}

function checkGpiosetSync() {
  if (gpiosetAvailable !== null) return gpiosetAvailable;
  try {
    const { execSync } = require("child_process");
    execSync("which gpioset", { stdio: "pipe", timeout: 1000 });
    gpiosetAvailable = true;
  } catch (_) {
    gpiosetAvailable = false;
  }
  return gpiosetAvailable;
}

function checkCooldown(pin, cooldownSec) {
  const t = lastActionTime[pin];
  if (!t) return true;
  return (Date.now() - t) / 1000 >= cooldownSec;
}

function recordAction(pin) {
  lastActionTime[pin] = Date.now();
}

function runGpioset(pin, value, seconds) {
  return new Promise((resolve) => {
    const secStr = Math.max(MIN_PULSE_SEC, Math.min(seconds, 60)).toFixed(1);
    const args = ["-m", "time", "-s", secStr, "gpiochip0", `${pin}=${value}`];
    const child = spawn("gpioset", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => { stderr += c; });
    child.on("error", () => resolve({ ok: false, reason: "gpioset_failed" }));
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, reason: (stderr || `exit_${code}`).trim().slice(0, 80) });
    });
  });
}

async function pulsePin(pin, ms) {
  const cfg = getControlConfig();
  const logPrefix = "[piclaw] gpio control:";
  if (!detectPlatform.isRaspberryPi()) {
    console.log(`${logPrefix} action=pulse pin=${pin} duration=${ms}ms result=fail not_pi`);
    return { ok: false, reason: "not_raspberry_pi" };
  }
  if (!cfg.enabled) {
    console.log(`${logPrefix} action=pulse pin=${pin} duration=${ms}ms result=fail disabled`);
    return { ok: false, reason: "gpio_control_disabled" };
  }
  if (!cfg.gpiosetAvailable) {
    console.log(`${logPrefix} action=pulse pin=${pin} duration=${ms}ms result=fail gpioset_missing`);
    return { ok: false, reason: "gpioset_not_available" };
  }
  const whitelist = cfg.whitelist;
  const pinNum = parseInt(pin, 10);
  if (Number.isNaN(pinNum) || !whitelist.includes(pinNum)) {
    console.log(`${logPrefix} action=pulse pin=${pin} duration=${ms}ms result=fail not_whitelisted`);
    return { ok: false, reason: "pin_not_whitelisted" };
  }
  const msNum = parseInt(ms, 10);
  if (Number.isNaN(msNum) || msNum < 0 || msNum > cfg.maxMs) {
    console.log(`${logPrefix} action=pulse pin=${pin} duration=${ms}ms result=fail invalid_duration`);
    return { ok: false, reason: `duration must be 0–${cfg.maxMs}ms` };
  }
  if (!checkCooldown(pinNum, cfg.cooldownSec)) {
    console.log(`${logPrefix} action=pulse pin=${pin} duration=${ms}ms result=fail cooldown`);
    return { ok: false, reason: "cooldown" };
  }
  const sec = Math.max(MIN_PULSE_SEC, msNum / 1000);
  recordAction(pinNum);
  const result = await runGpioset(pinNum, 1, sec);
  console.log(`${logPrefix} action=pulse pin=${pin} duration=${ms}ms result=${result.ok ? "ok" : "fail " + (result.reason || "")}`);
  return result;
}

async function setPinFor(pin, value, sec) {
  const cfg = getControlConfig();
  const logPrefix = "[piclaw] gpio control:";
  if (!detectPlatform.isRaspberryPi()) {
    console.log(`${logPrefix} action=set pin=${pin} value=${value} duration=${sec}s result=fail not_pi`);
    return { ok: false, reason: "not_raspberry_pi" };
  }
  if (!cfg.enabled) {
    console.log(`${logPrefix} action=set pin=${pin} value=${value} duration=${sec}s result=fail disabled`);
    return { ok: false, reason: "gpio_control_disabled" };
  }
  if (!cfg.gpiosetAvailable) {
    console.log(`${logPrefix} action=set pin=${pin} value=${value} duration=${sec}s result=fail gpioset_missing`);
    return { ok: false, reason: "gpioset_not_available" };
  }
  const whitelist = cfg.whitelist;
  const pinNum = parseInt(pin, 10);
  if (Number.isNaN(pinNum) || !whitelist.includes(pinNum)) {
    console.log(`${logPrefix} action=set pin=${pin} value=${value} duration=${sec}s result=fail not_whitelisted`);
    return { ok: false, reason: "pin_not_whitelisted" };
  }
  const val = (String(value).toUpperCase() === "HIGH" || value === 1) ? 1 : 0;
  const secNum = parseFloat(sec);
  if (Number.isNaN(secNum) || secNum < 0 || secNum > cfg.maxSec) {
    console.log(`${logPrefix} action=set pin=${pin} value=${value} duration=${sec}s result=fail invalid_duration`);
    return { ok: false, reason: `duration must be 0–${cfg.maxSec}s` };
  }
  if (!checkCooldown(pinNum, cfg.cooldownSec)) {
    console.log(`${logPrefix} action=set pin=${pin} value=${value} duration=${sec}s result=fail cooldown`);
    return { ok: false, reason: "cooldown" };
  }
  const durationSec = Math.max(MIN_PULSE_SEC, Math.min(secNum, cfg.maxSec));
  recordAction(pinNum);
  const result = await runGpioset(pinNum, val, durationSec);
  console.log(`${logPrefix} action=set pin=${pin} value=${value} duration=${sec}s result=${result.ok ? "ok" : "fail " + (result.reason || "")}`);
  return result;
}

module.exports = {
  isControlEnabled,
  getControlConfig,
  pulsePin,
  setPinFor,
};
