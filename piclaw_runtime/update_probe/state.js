"use strict";

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "..", "update_state.json");

const DEFAULT_STATE = {
  last_checked: null,
  last_notified_version: null,
};

function loadProbeState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    return {
      last_checked: data.last_checked ?? null,
      last_notified_version: data.last_notified_version ?? null,
    };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  return { ...DEFAULT_STATE };
}

function saveProbeState(state) {
  const data = {
    last_checked: state.last_checked,
    last_notified_version: state.last_notified_version,
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), "utf8");
}

module.exports = { loadProbeState, saveProbeState };
