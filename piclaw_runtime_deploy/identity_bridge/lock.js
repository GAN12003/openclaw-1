"use strict";

const fs = require("fs");
const path = require("path");
const { lockPath } = require("./paths");

const STALE_LOCK_THRESHOLD_MS = 60_000;

/**
 * Run fn with advisory lock. Acquires .lock (wx), runs fn, releases in finally.
 * If lock exists and is older than STALE_LOCK_THRESHOLD_MS, treat as stale (crash) and remove before acquiring.
 * If lock exists and is recent, return null without running fn.
 * @param { () => T } fn - Sync function that may perform writes.
 * @returns { T | null } - Return value of fn, or null if lock could not be acquired.
 */
function withLock(fn) {
  const lockfile = lockPath();
  try {
    if (fs.existsSync(lockfile)) {
      const stat = fs.statSync(lockfile);
      const mtimeMs = stat.mtime ? stat.mtime.getTime() : 0;
      if (Date.now() - mtimeMs >= STALE_LOCK_THRESHOLD_MS) {
        fs.unlinkSync(lockfile);
      } else {
        return null;
      }
    }
  } catch (_) {
    return null;
  }
  let fd;
  try {
    fd = fs.openSync(lockfile, "wx");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    if (e.code === "EEXIST") return null;
    throw e;
  }
  try {
    return fn();
  } finally {
    try {
      fs.closeSync(fd);
      fs.unlinkSync(lockfile);
    } catch (_) {}
  }
}

let _identityAvailable = null;

/**
 * Freeze identity availability for process lifetime. Call once at startup after validate.
 * All subsequent identityDirExists() calls return this cached value.
 */
function freezeAvailability() {
  const root = path.dirname(lockPath());
  try {
    _identityAvailable = fs.existsSync(root) && fs.statSync(root).isDirectory();
  } catch (_) {
    _identityAvailable = false;
  }
}

/**
 * Check if identity root directory exists (caller may use before attempting writes).
 * After freezeAvailability() is called, returns the cached value for process lifetime.
 */
function identityDirExists() {
  if (_identityAvailable !== null) return _identityAvailable;
  const root = path.dirname(lockPath());
  try {
    return fs.existsSync(root) && fs.statSync(root).isDirectory();
  } catch (_) {
    return false;
  }
}

module.exports = { withLock, identityDirExists, freezeAvailability };
