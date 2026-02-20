"use strict";

const registry = require("./registry");
const identityBridge = require("../identity_bridge");

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Run UART confidence decay if due (at most once per 24h).
 * Devices not seen in 30 days get confidence *= 0.9.
 * Uses monotonic comparison (Date.now() - lastSeenMs > THIRTY_DAYS_MS).
 */
function runIfDue() {
  if (!identityBridge.isAvailable()) return;

  const lastRun = identityBridge.readLastUartDecay();
  if (lastRun) {
    const lastRunMs = new Date(lastRun).getTime();
    if (Number.isNaN(lastRunMs) || Date.now() - lastRunMs < TWENTY_FOUR_HOURS_MS) {
      return;
    }
  }

  const data = registry.load();
  const devices = data.devices || [];
  let changed = false;
  const nowMs = Date.now();

  for (const d of devices) {
    const lastSeen = d.last_seen;
    if (!lastSeen) continue;
    const lastSeenMs = new Date(lastSeen).getTime();
    if (Number.isNaN(lastSeenMs)) continue;
    if (nowMs - lastSeenMs > THIRTY_DAYS_MS) {
      d.confidence = Math.max(0, (d.confidence || 0) * 0.9);
      changed = true;
    }
  }

  if (changed) {
    registry.save(devices);
  }
  identityBridge.writeLastUartDecay(new Date().toISOString());
}

module.exports = { runIfDue };
