"use strict";

const fs = require("fs");
const path = require("path");
const readers = require("./readers");
const writers = require("./writers");
const { identityDirExists } = require("./lock");
const { selfPath, getRoot } = require("./paths");

const RUNTIME_STATE_PATH = path.join(__dirname, "..", "state.json");

/**
 * Validate identity: check meta schema, required keys. On first run, seed self.json from state.json if missing.
 * @returns {{ ok: boolean, errors?: string[] }}
 */
function validateIdentity() {
  if (!identityDirExists()) {
    return { ok: true };
  }

  const errors = [];
  const meta = readers.loadMeta();
  if (meta.schema_version == null) {
    errors.push("meta.json missing schema_version");
  }
  const self = readers.loadSelf();
  if (!self.device_id && self.device_id !== null) {
    errors.push("self.json missing device_id");
  }

  // First-time seed: if self.json was missing and we have runtime state.json, seed once.
  if (!fs.existsSync(selfPath())) {
    try {
      const raw = fs.readFileSync(RUNTIME_STATE_PATH, "utf8");
      const stateData = JSON.parse(raw);
      writers.seedSelfFromState(stateData);
    } catch (e) {
      if (e.code !== "ENOENT") {
        errors.push("state.json read failed: " + e.message);
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Warn once if identity dir exists but has lax permissions (ownership or group/other bits).
 * No enforcement; log only.
 */
function warnIdentityPermissions() {
  if (!identityDirExists()) return;
  try {
    const identityRoot = getRoot();
    const stat = fs.statSync(identityRoot);
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
      console.warn("[piclaw] identity dir not owned by process user");
    }
    if ((stat.mode & 0o77) !== 0) {
      console.warn("[piclaw] identity dir permissions are too open");
    }
  } catch (_) {}
}

/**
 * When PICLAW_IDENTITY_STRICT_PERMS=1 and identity dir exists, require ownership by process user and mode 0700.
 * @returns {{ ok: boolean, errors?: string[] }}
 */
function checkStrictIdentityPermissions() {
  if (process.env.PICLAW_IDENTITY_STRICT_PERMS !== "1") {
    return { ok: true };
  }
  if (!identityDirExists()) {
    return { ok: true };
  }
  if (typeof process.getuid !== "function") {
    return { ok: true };
  }
  const errors = [];
  try {
    const identityRoot = getRoot();
    const stat = fs.statSync(identityRoot);
    if (stat.uid !== process.getuid()) {
      errors.push("identity dir must be owned by process user (current uid " + process.getuid() + ")");
    }
    if ((stat.mode & 0o77) !== 0) {
      errors.push("identity dir must be mode 0700 (no group/other access)");
    }
  } catch (e) {
    errors.push("identity dir stat failed: " + (e.message || "unknown"));
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

module.exports = { validateIdentity, warnIdentityPermissions, checkStrictIdentityPermissions };
