"use strict";

const si = require("systeminformation");

/**
 * Current WiFi SSID and signal strength (when available).
 * Uses wifiConnections() for active connection; fallback to networkInterfaces.
 * Standalone — no OpenClaw dependency.
 */
async function getWifi() {
  try {
    // Prefer active WiFi connection (has signalLevel / quality)
    const connections = await Promise.resolve(si.wifiConnections()).catch(() => []);
    const active = connections[0];
    if (active) {
      return {
        ssid: active.ssid || "unknown",
        signal: active.signalLevel != null ? `${active.signalLevel} dBm` : (active.quality != null ? `${active.quality}%` : null),
      };
    }

    const ifaces = await Promise.resolve(si.networkInterfaces());
    const wlan = ifaces.find(
      (i) => i.iface === "wlan0" || (i.iface && i.iface.toLowerCase().startsWith("wl"))
    ) || ifaces[0];
    if (!wlan) return { ssid: null, signal: null };

    return { ssid: wlan.ssid || "unknown", signal: null };
  } catch (e) {
    return { ssid: null, signal: null };
  }
}

module.exports = { getWifi };
