"use strict";

const { execSync } = require("child_process");

/**
 * WiFi connection state and signal from `iw dev wlan0 link`.
 * Fails gracefully on Windows/WSL or when iw not available.
 */
function getWifiStatus() {
  try {
    const out = execSync("iw dev wlan0 link", { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
    const lines = out.split("\n").map((s) => s.trim());
    let ssid = null;
    let signal = null;
    let connected = false;

    for (const line of lines) {
      if (line.startsWith("SSID:")) {
        ssid = line.replace(/^SSID:\s*/, "").trim();
        connected = true;
      }
      if (line.startsWith("signal:")) {
        const m = line.match(/signal:\s*(-?\d+(?:\.\d+)?)\s*dBm/);
        if (m) signal = `${Math.round(parseFloat(m[1]))} dBm`;
      }
    }

    return { connected: !!ssid, ssid, signal };
  } catch (_) {
    return { connected: false };
  }
}

module.exports = { getWifiStatus };
