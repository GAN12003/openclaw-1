"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_PATH = path.join(__dirname, "..", "state.json");

const DEFAULTS = {
  device_id: null,
  first_boot: null,
  hostname: os.hostname(),
  platform: process.platform,
  arch: process.arch,
};

/**
 * Load device identity from runtime state.json (device_id, first_boot, hostname).
 * Used for status and integrations. For durable identity (mission, goals), use identity_bridge.
 */
function loadIdentity() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const data = JSON.parse(raw);
    return {
      device_id: data.device_id ?? DEFAULTS.device_id,
      first_boot: data.first_boot ?? DEFAULTS.first_boot,
      hostname: data.hostname ?? DEFAULTS.hostname,
      platform: data.platform ?? DEFAULTS.platform,
      arch: data.arch ?? DEFAULTS.arch,
    };
  } catch (e) {
    if (e.code === "ENOENT") {
      return { ...DEFAULTS };
    }
    throw e;
  }
}

module.exports = { loadIdentity };
