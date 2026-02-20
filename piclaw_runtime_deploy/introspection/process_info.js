"use strict";

const os = require("os");

/**
 * Read-only view of current process state.
 */
function getProcessInfo() {
  const mem = process.memoryUsage();
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  return {
    pid: process.pid,
    uptime: Math.floor(process.uptime()),
    memory_usage: `${rssMB} MB`,
    node_version: process.version,
    platform: process.platform,
  };
}

module.exports = { getProcessInfo };
