"use strict";

/**
 * Presence loop — periodic narration of operational status, memory, and device awareness.
 * Read-only. Only calls express.say(); no GPIO, install, or network.
 */

const identityBridge = require("./identity_bridge");
const registry = require("./uart_identity/registry");
const express = require("./perception/express");

const DEFAULT_INTERVAL_MIN = 5;

let intervalId = null;

function tick() {
  express.say("I remain operational.");
  express.say(
    identityBridge.isAvailable()
      ? "My memory is accessible."
      : "My memory is not configured."
  );
  const devices = registry.load().devices || [];
  const n = devices.length;
  const deviceLine =
    n === 0
      ? "No devices in my awareness."
      : n === 1
        ? "One known device is within my awareness."
        : n + " known devices are within my awareness.";
  express.say(deviceLine);
}

function startPresenceLoop() {
  if (intervalId) return;
  const raw = process.env.PICLAW_PRESENCE_INTERVAL_MIN || String(DEFAULT_INTERVAL_MIN);
  const minutes = Math.max(1, Math.min(60, parseFloat(raw) || DEFAULT_INTERVAL_MIN));
  const intervalMs = Math.round(minutes * 60 * 1000);
  setTimeout(() => {
    tick();
    intervalId = setInterval(tick, intervalMs);
  }, intervalMs);
  console.log("[piclaw] presence loop started (interval " + minutes + " min)");
}

function stopPresenceLoop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startPresenceLoop, stopPresenceLoop };
