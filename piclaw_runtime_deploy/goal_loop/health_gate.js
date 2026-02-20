"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { SAFE_ROOT } = require("../core/self_guard");

const MIN_DISK_MB = 50;

/**
 * Check if system is healthy enough to run goal review. Returns { ok: boolean, reason?: string }.
 */
function runHealthGate() {
  try {
    const out = execSync("df -k .", { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
    const lines = out.trim().split("\n");
    if (lines.length >= 2) {
      const header = lines[0].split(/\s+/);
      const data = lines[1].split(/\s+/);
      const availIdx = header.findIndex((h) => h === "Avail" || h === "Available");
      const availK = availIdx >= 0 ? parseInt(data[availIdx], 10) : parseInt(data[3], 10);
      if (!Number.isNaN(availK) && availK < MIN_DISK_MB * 1024) {
        return { ok: false, reason: "low disk space" };
      }
    }
  } catch (_) {
    return { ok: false, reason: "disk check failed" };
  }

  try {
    const testFile = path.join(SAFE_ROOT, ".goal_loop_write_test");
    fs.writeFileSync(testFile, "ok", "utf8");
    fs.unlinkSync(testFile);
  } catch (_) {
    return { ok: false, reason: "runtime not writable" };
  }

  return { ok: true };
}

module.exports = { runHealthGate };
