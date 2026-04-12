"use strict";

const si = require("systeminformation");

/**
 * CPU temperature (C) and system uptime (seconds).
 * Standalone — no OpenClaw dependency.
 */
async function getHealth() {
  // systeminformation may return a Promise or a plain value depending on version;
  // Promise.resolve() normalizes so .catch always works.
  const [temp, time] = await Promise.all([
    Promise.resolve(si.cpuTemperature()).catch(() => ({ main: null })),
    Promise.resolve(si.time()).catch(() => ({ uptime: 0 })),
  ]);
  const cpuTemp = temp.main != null ? Math.round(temp.main) : null;
  const uptimeSec = time.uptime != null ? Math.floor(time.uptime) : 0;
  return { cpuTemp, uptimeSec };
}

function formatUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = { getHealth, formatUptime };
