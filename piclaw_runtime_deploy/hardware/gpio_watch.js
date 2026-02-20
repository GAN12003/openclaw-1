"use strict";

const { spawn } = require("child_process");

const DEFAULT_PINS = [17, 27, 22];
const MAX_EVENTS = 50;

let proc = null;
let monitored = [];
let last_events = [];
let onEvent = null;

function parsePinsEnv() {
  const raw = (process.env.PICLAW_GPIO_PINS || "").trim();
  if (!raw) return DEFAULT_PINS;
  return raw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n) && n >= 0);
}

function startGPIOWatch(opts = {}) {
  if (proc) return;
  if (typeof opts.onEvent === "function") onEvent = opts.onEvent;
  monitored = parsePinsEnv();
  if (monitored.length === 0) return;
  const args = ["-F", "%o %E", "--num-events=0", "gpiochip0", ...monitored.map(String)];
  try {
    proc = spawn("gpiomon", args, { stdio: ["ignore", "pipe", "pipe"] });
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk) => {
      const lines = chunk.split("\n").filter(Boolean);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const offset = parseInt(parts[0], 10);
          const edge = parts[1].toLowerCase();
          const value = edge === "rising" ? "HIGH" : "LOW";
          const ev = { gpio: offset, value, at: new Date().toISOString() };
          last_events.unshift(ev);
          if (last_events.length > MAX_EVENTS) last_events.pop();
          if (onEvent) onEvent(ev);
        }
      }
    });
    proc.stderr.on("data", () => {});
    proc.on("error", () => {
      proc = null;
      last_events = [];
    });
    proc.on("exit", () => {
      proc = null;
    });
  } catch (_) {
    proc = null;
    monitored = [];
  }
}

function getGPIOStatus() {
  return {
    monitored: [...monitored],
    last_events: [...last_events],
  };
}

module.exports = { startGPIOWatch, getGPIOStatus };
