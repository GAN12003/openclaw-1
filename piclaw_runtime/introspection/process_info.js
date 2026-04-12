"use strict";

const os = require("os");

/**
 * Numeric snapshot for logging (host-health NDJSON, correlations).
 * @returns {{ pid: number, rssMb: number, heapUsedMb: number }}
 */
function getProcessMemorySnapshot() {
  const mem = process.memoryUsage();
  return {
    pid: process.pid,
    rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
  };
}

/**
 * Read-only view of current process state.
 */
function getProcessInfo() {
  const snap = getProcessMemorySnapshot();
  const rssWhole = Math.round(snap.rssMb);
  return {
    pid: snap.pid,
    uptime: Math.floor(process.uptime()),
    memory_usage: `${rssWhole} MB`,
    node_version: process.version,
    platform: process.platform,
  };
}

module.exports = { getProcessInfo, getProcessMemorySnapshot };
