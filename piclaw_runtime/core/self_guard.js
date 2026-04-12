"use strict";

const path = require("path");

/** Runtime root: directory containing piclaw.js (one level up from core/). */
const SAFE_ROOT = path.resolve(path.join(__dirname, ".."));

/**
 * Returns true only if fullPath is inside SAFE_ROOT (rejects path traversal).
 * @param {string} fullPath - Absolute path to check.
 * @returns {boolean}
 */
function isPathSafe(fullPath) {
  const normalized = path.resolve(fullPath);
  return normalized === SAFE_ROOT || normalized.startsWith(SAFE_ROOT + path.sep);
}

module.exports = { SAFE_ROOT, isPathSafe };
