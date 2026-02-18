"use strict";

const fs = require("fs");

/**
 * Return true if we appear to be running on a Raspberry Pi (Linux + cpuinfo).
 * Used to disable hardware logic on Windows/WSL.
 */
function isRaspberryPi() {
  if (process.platform !== "linux") return false;
  try {
    const cpuinfo = fs.readFileSync("/proc/cpuinfo", "utf8");
    return cpuinfo.includes("Raspberry Pi");
  } catch (_) {
    return false;
  }
}

module.exports = { isRaspberryPi };
