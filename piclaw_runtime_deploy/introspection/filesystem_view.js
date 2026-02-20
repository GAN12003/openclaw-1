"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { SAFE_ROOT, isPathSafe } = require("../core/self_guard");

/**
 * Read-only view: cwd, runtime dir, disk usage. List only inside piclaw_runtime.
 */
function getFilesystemView() {
  const cwd = process.cwd();
  const runtimeDir = SAFE_ROOT;

  let diskFree = null;
  try {
    const out = execSync("df -h .", { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
    const lines = out.trim().split("\n");
    if (lines.length >= 2) {
      const header = lines[0].split(/\s+/);
      const data = lines[1].split(/\s+/);
      const availIdx = header.findIndex((h) => h === "Avail" || h === "Available");
      if (availIdx >= 0 && data[availIdx]) diskFree = data[availIdx];
      else if (data.length >= 4) diskFree = data[3];
    }
  } catch (_) {}

  return { cwd, runtimeDir, diskFree: diskFree || "n/a" };
}

/**
 * List directory only if path is inside piclaw_runtime. Rejects path traversal.
 */
function listRuntimeDir(relativePath) {
  const full = path.join(SAFE_ROOT, relativePath || ".");
  if (!isPathSafe(full)) return null;
  try {
    return fs.readdirSync(full);
  } catch (_) {
    return null;
  }
}

module.exports = { getFilesystemView, listRuntimeDir };
