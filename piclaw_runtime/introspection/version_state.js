"use strict";

const fs = require("fs");
const path = require("path");

const VERSION_FILE = path.join(__dirname, "..", "version.json");
const DEFAULT_VERSION = "0.1.0";

/**
 * Read or create version.json (never overwrite existing).
 */
function getVersionState() {
  try {
    const raw = fs.readFileSync(VERSION_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  const state = {
    version: DEFAULT_VERSION,
    installed_at: new Date().toISOString(),
  };
  fs.writeFileSync(VERSION_FILE, JSON.stringify(state, null, 2), "utf8");
  return state;
}

module.exports = { getVersionState };
