"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const STATE_PATH = path.join(__dirname, "..", "state.json");

const DEFAULTS = {
  device_id: null,
  first_boot: null,
  hostname: os.hostname(),
  platform: process.platform,
  arch: process.arch,
};

function persistIdentityState(data) {
  const body = JSON.stringify(data, null, 2) + "\n";
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  fs.renameSync(tmp, STATE_PATH);
}

/**
 * Ensure state.json has stable device_id and first_boot (fixes legacy nulls / empty file).
 * @param {Record<string, unknown>} data
 * @returns {{ data: Record<string, unknown>, changed: boolean }}
 */
function ensureDeviceFields(data) {
  const out = { ...data };
  let changed = false;
  if (!out.device_id || String(out.device_id).trim() === "") {
    out.device_id = crypto.randomUUID();
    changed = true;
  }
  if (!out.first_boot || String(out.first_boot).trim() === "") {
    out.first_boot = new Date().toISOString();
    changed = true;
  }
  if (out.hostname == null || String(out.hostname).trim() === "") {
    out.hostname = os.hostname();
    changed = true;
  }
  if (out.platform == null || String(out.platform).trim() === "") {
    out.platform = process.platform;
    changed = true;
  }
  if (out.arch == null || String(out.arch).trim() === "") {
    out.arch = process.arch;
    changed = true;
  }
  return { data: out, changed };
}

/**
 * Load device identity from runtime state.json (device_id, first_boot, hostname).
 * Persists once if file was missing or device_id/first_boot were empty (Pi fleet / legacy installs).
 * For durable identity (mission, goals), use identity_bridge.
 */
function loadIdentity() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...parsed };
    const { data, changed } = ensureDeviceFields(merged);
    if (changed) {
      persistIdentityState(data);
    }
    return {
      device_id: data.device_id ?? DEFAULTS.device_id,
      first_boot: data.first_boot ?? DEFAULTS.first_boot,
      hostname: data.hostname ?? DEFAULTS.hostname,
      platform: data.platform ?? DEFAULTS.platform,
      arch: data.arch ?? DEFAULTS.arch,
    };
  } catch (e) {
    if (e.code === "ENOENT") {
      const { data } = ensureDeviceFields({ ...DEFAULTS });
      persistIdentityState(data);
      return {
        device_id: data.device_id,
        first_boot: data.first_boot,
        hostname: data.hostname,
        platform: data.platform,
        arch: data.arch,
      };
    }
    throw e;
  }
}

module.exports = { loadIdentity };
