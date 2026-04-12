"use strict";

const fs = require("fs");
const path = require("path");
const uartActivityLog = require("./uart_activity_log");

const SERIAL_PATHS = ["/dev/serial0", "/dev/ttyAMA0"];

let stream = null;
let status = { active: false, last_seen: null, bytes: 0 };
let onActivity = null;
let storedOpts = null;
let paused = false;

function startUARTWatch(opts = {}) {
  if (stream) return;
  if (typeof opts.onActivity === "function") onActivity = opts.onActivity;
  storedOpts = opts;
  for (const p of SERIAL_PATHS) {
    try {
      if (!fs.existsSync(p)) continue;
      stream = fs.createReadStream(p, { flags: "r" });
      status = { active: true, last_seen: status.last_seen, bytes: status.bytes };
      let activityLogged = false;
      stream.on("data", (chunk) => {
        status.last_seen = new Date().toISOString();
        status.bytes += chunk.length;
        uartActivityLog.maybeAppendUartActivity({ device: p, cumulativeBytes: status.bytes });
        if (onActivity && !activityLogged) {
          activityLogged = true;
          onActivity(p);
        }
      });
      stream.on("error", () => {
        try {
          stream.destroy();
        } catch (_) {}
        stream = null;
        status.active = false;
      });
      stream.on("close", () => {
        if (!paused) status.active = false;
        stream = null;
      });
      return;
    } catch (_) {
      continue;
    }
  }
}

function pauseUARTWatch() {
  if (!stream) return;
  paused = true;
  try {
    stream.destroy();
  } catch (_) {}
  stream = null;
  status.active = false;
}

function resumeUARTWatch() {
  if (!paused) return;
  paused = false;
  if (storedOpts) startUARTWatch(storedOpts);
}

function getUARTStatus() {
  return { ...status };
}

module.exports = { startUARTWatch, pauseUARTWatch, resumeUARTWatch, getUARTStatus };
