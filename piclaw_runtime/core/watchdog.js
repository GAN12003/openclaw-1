"use strict";

const fs = require("fs");
const path = require("path");

const HEARTBEAT_PATH = path.join(__dirname, "..", "heartbeat.json");
const INTERVAL_MS = 30_000;

let intervalId = null;

function startWatchdog() {
  if (intervalId) return;
  function tick() {
    try {
      fs.writeFileSync(
        HEARTBEAT_PATH,
        JSON.stringify({ last_seen: new Date().toISOString() }, null, 2),
        "utf8"
      );
    } catch (_) {}
  }
  tick();
  intervalId = setInterval(tick, INTERVAL_MS);
}

module.exports = { startWatchdog };
